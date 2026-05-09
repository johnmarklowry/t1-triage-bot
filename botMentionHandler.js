/**
 * botMentionHandler.js
 * Handles @mentions of the bot to assess bug severity based on thread content and Jira tickets
 */
const { slackApp } = require('./appHome');
const axios = require('axios');
const { getMergedSlaGuidelines } = require('./repositories/severityContext');
const { assessDraftSlaGrounding } = require('./lib/slaDraftGrounding');

// Configure JIRA API credentials
const JIRA_CONFIG = {
  baseUrl: process.env.JIRA_API_URL,
  auth: {
    username: process.env.JIRA_USERNAME,
    password: process.env.JIRA_API_TOKEN
  }
};

// Configure LLM API settings
const LLM_CONFIG = {
  apiUrl: process.env.LLM_API_URL,
  apiKey: process.env.LLM_API_KEY
};

const DEFAULT_SEVERITY_MODEL = 'gpt-4-turbo';

function getSeverityModel() {
  return process.env.OPENAI_SEVERITY_MODEL || DEFAULT_SEVERITY_MODEL;
}

function getJudgeModel() {
  return process.env.OPENAI_JUDGE_MODEL || getSeverityModel();
}

/** Plain-text SLA guardrails (mirrors sla-guidelines metadata; repeated here so follow-ups always see them via system prompt). */
const SEVERITY_DOMAIN_GUARDRAILS = `Severity classification rules you MUST follow:
• Before citing Business Priority Level 1 for "Search Inventory Tool (SIT)", "L/Certified inventory search", or similar inventory-search criteria, confirm the issue is about inventory or certified-inventory search—not Lexus.com site-wide/header/content search.
• Lexus.com site search issues must NOT be classified as Level 1 solely because search returns no or incorrect results if the only matching SLA bullets are inventory-search (SIT/L-Certified) criteria. Another independent Level 1 criterion must apply for Level 1.
• When uncertain whether an issue is site search vs inventory search, state that ambiguity and avoid overstating severity.`;

const QA_FORMAT_NOTICE =
  '\n\n• _Automated QA did not return a valid verdict format after retry; please verify this assessment against the SLA._';

const GROUNDING_NOTICE =
  '\n\n• _Some bullet-style SLA cites could not be matched to the merged guideline text automatically; please confirm against the official SLA._';

const JUDGE_RETRY_HINT = `IMPORTANT: Your previous reply did not follow the required format. Reply with ONLY one of these blocks—no preamble, no markdown fences, no commentary before VERDICT:

VERDICT: APPROVE

OR

VERDICT: REVISE
MESSAGE:
<full revised Slack-formatted assessment the user should see>`;

const GENERATOR_SYSTEM_PROMPT = `You are a bug severity assessment expert for Lexus.com. You analyze issues and determine their Business Priority Level according to established SLA criteria.

${SEVERITY_DOMAIN_GUARDRAILS}

Format your responses for Slack: use *asterisks for bold* (not markdown headers with #), use simple bullet points with • symbols, and keep formatting simple. You can engage in a conversation about your assessment, explaining your reasoning or reconsidering if the user provides additional context. Your assessments should be clear, structured, and grounded in facts from the provided information and SLA JSON only—do not invent SLA criteria.`;

/**
 * Strip basic HTML from Jira renderedFields description.
 */
function stripHtmlBasic(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract plain text from Jira Atlassian Document Format (ADF).
 */
function extractPlainTextFromAdf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return String(node);

  let out = '';
  if (node.text) out += node.text;
  if (Array.isArray(node.content)) {
    out += node.content.map(extractPlainTextFromAdf).join('');
  }
  return out.replace(/\s+/g, ' ').trim();
}

function resolveJiraDescription(fieldsDescription, renderedDescription) {
  const rendered = stripHtmlBasic(renderedDescription);
  if (rendered) return rendered;

  if (fieldsDescription && typeof fieldsDescription === 'object') {
    const fromAdf = extractPlainTextFromAdf(fieldsDescription);
    if (fromAdf) return fromAdf;
  }

  if (typeof fieldsDescription === 'string' && fieldsDescription.trim()) {
    return fieldsDescription.trim();
  }

  return 'No description provided';
}

// Simple in-memory conversation tracking
// In production, use a database for persistence
const conversationMemory = new Map();

/**
 * Create or update conversation memory for a thread
 */
function updateConversationMemory(channelId, threadTs, data) {
  const key = `${channelId}:${threadTs}`;
  const existingData = conversationMemory.get(key) || {};
  conversationMemory.set(key, { ...existingData, ...data });
  
  // Set a timeout to clean up memory after 1 hour (optional)
  setTimeout(() => {
    conversationMemory.delete(key);
  }, 60 * 60 * 1000);
  
  return conversationMemory.get(key);
}

/**
 * Get conversation memory for a thread
 */
function getConversationMemory(channelId, threadTs) {
  const key = `${channelId}:${threadTs}`;
  return conversationMemory.get(key) || {};
}

/**
 * Format the LLM response to be properly displayed in Slack
 */
function formatForSlack(text) {
  // Replace Markdown headers with Slack-formatted bold text
  text = text.replace(/#{1,6}\s+(.*?)$/gm, '*$1*');
  
  // Ensure lists work properly (Slack prefers simple hyphens or numbers)
  text = text.replace(/^\s*[-*]\s+/gm, '• ');
  
  // Make sure bold format uses Slack's format (*bold*)
  text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  // Convert blockquotes to simple indentation
  text = text.replace(/^\s*>\s+(.*?)$/gm, '   $1');
  
  return text;
}

/**
 * Extract Jira ticket ID from a URL or text
 */
function extractJiraTicketId(text) {
  if (!text) return null;
  
  // Match PROJ-123 pattern or extract from URLs like https://yourcompany.atlassian.net/browse/PROJ-123
  const jiraTicketRegex = /(?:https?:\/\/[^\/]+\/browse\/)?([A-Z]+-\d+)/i;
  const match = text.match(jiraTicketRegex);
  return match ? match[1] : null;
}

/**
 * Fetch Jira ticket details
 */
async function getJiraTicketDetails(ticketId) {
  try {
    console.log(`Fetching details for Jira ticket: ${ticketId}`);
    
    const response = await axios.get(
      `${JIRA_CONFIG.baseUrl}/rest/api/3/issue/${ticketId}`,
      {
        auth: JIRA_CONFIG.auth,
        headers: {
          Accept: 'application/json'
        },
        params: { expand: 'renderedFields' }
      }
    );
    
    console.log(`Successfully retrieved data for ticket ${ticketId}`);
    
    // Extract relevant fields for severity assessment
    return {
      id: ticketId,
      summary: response.data.fields.summary,
      description: resolveJiraDescription(
        response.data.fields.description,
        response.data.renderedFields?.description
      ),
      priority: response.data.fields.priority?.name || 'Undefined',
      components: response.data.fields.components?.map(c => c.name) || [],
      labels: response.data.fields.labels || [],
      status: response.data.fields.status?.name || 'Unknown',
      issuetype: response.data.fields.issuetype?.name || 'Unknown',
      created: response.data.fields.created,
      reporter: response.data.fields.reporter?.displayName || 'Unknown',
      affected_users: response.data.fields.customfield_10041 || 'Not specified',
      environment: response.data.fields.environment || 'Not specified',
      resolution: response.data.fields.resolution?.name || 'Unresolved'
    };
  } catch (error) {
    console.error(`Error fetching Jira ticket ${ticketId}:`, error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    }
    return { 
      id: ticketId, 
      error: "Could not fetch ticket details",
      errorDetails: error.response?.status 
        ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message
    };
  }
}

/**
 * Detect if this is a follow-up question about a previous assessment
 */
function isFollowUpQuestion(text, conversationMemory) {
  if (!conversationMemory.hasAssessment) return false;
  
  const followUpKeywords = [
    'reassess', 'reconsider', 'reevaluate', 'why', 'how come', 
    'explain', 'more detail', 'could it be', 'should be', 
    'what if', 'change', 'update', 'different', 'incorrect',
    'wrong', 'disagree', 'instead'
  ];
  
  const lowerText = text.toLowerCase();
  
  // Check for severity level mentions
  const hasSevMention = /sev(?:erity)?\s*[1234]|level\s*[1234]|priority\s*[1234]/i.test(lowerText);
  
  // Check for follow-up keywords
  const hasFollowUpKeyword = followUpKeywords.some(keyword => lowerText.includes(keyword));
  
  return hasSevMention || hasFollowUpKeyword;
}

/**
 * Strip markdown fences / stray whitespace so VERDICT lines parse reliably.
 */
function sanitizeJudgeRaw(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  s = s.replace(/^```(?:\w*)?\s*\r?\n?/i, '');
  s = s.replace(/\r?\n?```\s*$/i, '');
  return s.trim();
}

/**
 * Parse judge model output: VERDICT: APPROVE | VERDICT: REVISE + MESSAGE: ...
 */
function parseJudgeVerdict(raw) {
  if (!raw || typeof raw !== 'string') return { verdict: 'UNKNOWN', revisedText: null };

  const trimmed = sanitizeJudgeRaw(raw);
  const approve = /^VERDICT:\s*APPROVE\b/im.exec(trimmed);
  if (approve) return { verdict: 'APPROVE', revisedText: null };

  const revise = /^VERDICT:\s*REVISE\b/im.exec(trimmed);
  if (revise) {
    const msgMatch = /\nMESSAGE:\s*([\s\S]+)/im.exec(trimmed);
    if (msgMatch && msgMatch[1]) {
      return { verdict: 'REVISE', revisedText: msgMatch[1].trim() };
    }
  }

  return { verdict: 'UNKNOWN', revisedText: null };
}

function buildJudgeUserContent({ draftText, threadSummary, ticketDigest, slaGuidelines }, retryPreamble) {
  const slaPayload = slaGuidelines ? JSON.stringify(slaGuidelines, null, 2) : '{}';
  const preamble = retryPreamble ? `${retryPreamble}\n\n---\n\n` : '';

  return `${preamble}
DRAFT_ASSESSMENT (may contain errors):
${draftText}

THREAD_SUMMARY (may be truncated):
${threadSummary || 'Not provided'}

TICKET_DIGEST (may be truncated):
${ticketDigest || 'Not provided'}

SLA_GUIDELINES_JSON:
${slaPayload}

Your job:
• Verify the draft only cites SLA objective criteria that exist in SLA_GUIDELINES_JSON and match the claimed severity level.
• Enforce domain rules in metadata.domain_glossary if present: site search vs Search Inventory Tool / L-Certified inventory search must not be conflated.
• If the draft classifies as Level 1 using only inventory-search bullets for what is clearly site search, or overstates HOT FIX without evidence, respond with REVISE and a corrected full user-facing message.
• Keep Slack formatting: *bold* not # headers, • bullets.

Respond in exactly this structure (no text before VERDICT):

VERDICT: APPROVE

OR

VERDICT: REVISE
MESSAGE:
<full revised Slack-formatted assessment the user should see>
`;
}

/**
 * Second-pass QA on draft severity assessment (optional different model via OPENAI_JUDGE_MODEL).
 * Retries once if output is not parseable; returns { text, verdict }.
 */
async function judgeSeverityDraft(openai, { draftText, threadSummary, ticketDigest, slaGuidelines }) {
  let lastRaw = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const retryPreamble = attempt === 1 ? JUDGE_RETRY_HINT : '';
    const userContent = buildJudgeUserContent(
      { draftText, threadSummary, ticketDigest, slaGuidelines },
      retryPreamble
    );

    const response = await openai.chat.completions.create({
      model: getJudgeModel(),
      messages: [
        {
          role: 'system',
          content:
            'You are an independent QA reviewer for Lexus.com bug severity assessments. You enforce SLA grounding and domain rules (site search vs inventory search). Output only the VERDICT block in the requested format—no preamble, no markdown code fences.'
        },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 1800
    });

    lastRaw = response.choices[0].message.content?.trim?.() || '';
    const parsed = parseJudgeVerdict(lastRaw);
    console.log('[severity-judge]', parsed.verdict, attempt === 1 ? '(retry)' : '');

    if (parsed.verdict === 'APPROVE') {
      return { text: draftText, verdict: 'APPROVE' };
    }
    if (parsed.verdict === 'REVISE' && parsed.revisedText) {
      return { text: formatForSlack(parsed.revisedText), verdict: 'REVISE' };
    }
  }

  console.warn('[severity-judge] UNKNOWN after retry; raw tail:', lastRaw.slice(-240));
  return { text: draftText, verdict: 'UNKNOWN' };
}

function shouldSkipJudge(draftText) {
  return !draftText || draftText.startsWith('Error:');
}

function truncateForJudge(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  const sep = '\n…[middle truncated]…\n';
  const budget = maxLen - sep.length;
  if (budget < 400) {
    return `${text.slice(0, Math.max(0, maxLen - 24))}\n…[truncated]`;
  }
  const headLen = Math.floor(budget * 0.55);
  const tailLen = budget - headLen;
  return `${text.slice(0, headLen)}${sep}${text.slice(-tailLen)}`;
}

/**
 * Call OpenAI API to assess severity and recommend next steps.
 * @param {string|null} threadContent
 * @param {Array|null} jiraTickets
 * @param {object|null} slaGuidelines
 * @param {string} userQuery
 * @param {Array} conversationHistory Prior assistant/user messages only (do not include the current userQuery).
 */
async function assessSeverity(threadContent, jiraTickets, slaGuidelines, userQuery, conversationHistory = []) {
  try {
    let formattedTickets = '';
    if (jiraTickets) {
      formattedTickets = jiraTickets
        .map(ticket => {
          if (ticket.error) {
            return `Ticket ID: ${ticket.id} - ERROR: ${ticket.error}`;
          }

          return `
TICKET: ${ticket.id}
Summary: ${ticket.summary}
Type: ${ticket.issuetype}
Status: ${ticket.status}
Priority: ${ticket.priority}
Reporter: ${ticket.reporter}
Created: ${ticket.created}
Components: ${ticket.components.join(', ') || 'None'}
Labels: ${ticket.labels.join(', ') || 'None'}
Affected Users: ${ticket.affected_users || 'Not specified'}
Environment: ${ticket.environment || 'Not specified'}

Description:
${ticket.description || 'No description provided'}
`;
        })
        .join('\n\n----------\n\n');
    }

    const { OpenAI } = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const messages = [{ role: 'system', content: GENERATOR_SYSTEM_PROMPT }];

    if (conversationHistory.length === 0) {
      messages.push({
        role: 'user',
        content: `
You are a bug severity assessment expert for the Lexus website team. You're analyzing a Slack conversation and Jira tickets to determine the appropriate severity level according to our Business Priority SLA.

SLACK THREAD CONTENT:
${threadContent || 'No thread content provided'}

JIRA TICKET DETAILS:
${formattedTickets || 'No ticket details available for this follow-up question'}

SLA GUIDELINES:
${slaGuidelines ? JSON.stringify(slaGuidelines, null, 2) : 'Using SLA guidelines from previous context'}

Based on the information above:

1. Determine the most appropriate Business Priority Level (1-4) for this issue
2. Cite specific objective criteria from the SLA that apply to this case
3. Provide clear reasoning for your assessment
4. Recommend the next steps according to the SLA deployment response
5. Note any dependencies mentioned in the SLA that might affect resolution
6. If there's insufficient information, specify what additional details would help with assessment

Your assessment should be formatted specifically for Slack: use *asterisks for bold* (not markdown headers with #), use simple bullet points with • symbols, and keep formatting simple but clear.
`
      });
    } else {
      messages.push(...conversationHistory);
      const followUpBody =
        slaGuidelines
          ? `SLA GUIDELINES (full reference for this conversation):\n${JSON.stringify(slaGuidelines, null, 2)}\n\nUser follow-up:\n${userQuery}`
          : userQuery;
      messages.push({
        role: 'user',
        content: followUpBody
      });
    }

    const response = await openai.chat.completions.create({
      model: getSeverityModel(),
      messages,
      temperature: 0.2,
      max_tokens: 1500
    });

    let formattedResponse = response.choices[0].message.content.trim();
    formattedResponse = formatForSlack(formattedResponse);

    return {
      text: formattedResponse,
      message: response.choices[0].message
    };
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return {
      text: `Error: Unable to assess severity at this time. ${error.message || 'Please try again later.'}`,
      message: { role: 'assistant', content: `Error: ${error.message}` }
    };
  }
}

/**
 * Generator + judge pipeline for Slack-facing severity text.
 */
async function assessSeverityWithJudge(ctx) {
  const {
    threadContent,
    jiraTickets,
    slaGuidelines,
    userQuery,
    conversationHistory = [],
    threadSummary,
    ticketDigest
  } = ctx;

  const { text, message } = await assessSeverity(
    threadContent,
    jiraTickets,
    slaGuidelines,
    userQuery,
    conversationHistory
  );

  if (shouldSkipJudge(text)) {
    return { text, message };
  }

  try {
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const judgeResult = await judgeSeverityDraft(openai, {
      draftText: text,
      threadSummary: truncateForJudge(threadSummary, 6000),
      ticketDigest: truncateForJudge(ticketDigest, 8000),
      slaGuidelines
    });

    let judged = judgeResult.text;
    if (judgeResult.verdict === 'UNKNOWN') {
      judged += QA_FORMAT_NOTICE;
    }

    const grounding = assessDraftSlaGrounding(judged, slaGuidelines);
    if (!grounding.grounded) {
      console.warn('[severity-grounding] samples:', grounding.ungroundedSamples);
      judged += GROUNDING_NOTICE;
    }

    const mergedMessage =
      typeof message.content === 'string'
        ? { ...message, content: judged }
        : { ...message, content: judged };

    return { text: judged, message: mergedMessage };
  } catch (err) {
    console.error('[severity-judge] failed, using draft:', err.message);
    let fallback = text;
    try {
      const grounding = assessDraftSlaGrounding(fallback, slaGuidelines);
      if (!grounding.grounded) {
        console.warn('[severity-grounding] samples:', grounding.ungroundedSamples);
        fallback += GROUNDING_NOTICE;
      }
    } catch (_) {
      /* ignore grounding errors when judge threw */
    }
    const mergedMessage =
      typeof message.content === 'string'
        ? { ...message, content: fallback }
        : { ...message, content: fallback };
    return { text: fallback, message: mergedMessage };
  }
}
/**
 * Check if a string contains assessment-related keywords
 */
function isAssessmentRequest(text) {
  const assessmentKeywords = [
    'assess', 'evaluate', 'severity', 'priority', 'triage', 'rate',
    'how severe', 'how critical', 'what level', 'sev', 'how bad'
  ];
  
  const lowercaseText = text.toLowerCase();
  return assessmentKeywords.some(keyword => lowercaseText.includes(keyword));
}

/**
 * Handle bot mention events
 */
slackApp.event('app_mention', async ({ event, client, logger }) => {
  try {
    // Only respond to mentions in threads, or create a thread if it's in the main channel
    const threadTs = event.thread_ts || event.ts;
    
    // Get the bot's user ID to filter out the mention
    const botInfo = await client.auth.test();
    const botUserId = botInfo.user_id;
    
    // Extract user's query by removing the bot mention
    const userQuery = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    
    // Get conversation memory for this thread
    const conversationMemory = getConversationMemory(event.channel, threadTs);
    
    // Check if this is a follow-up question about a previous assessment
    const isFollowUp = isFollowUpQuestion(userQuery, conversationMemory);
    
    // Handle regular assessment request
    if (!isFollowUp && !isAssessmentRequest(userQuery)) {
      // Handle other types of queries or provide help
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "Hello! I can help assess bug severity. Just mention me in a thread with a Jira ticket and ask me to 'assess severity' or 'evaluate this bug'."
      });
      return;
    }
    
    // Let the user know we're working on it
    const processingMessage = await client.chat.postMessage({
      channel: event.channel,
      thread_ts: threadTs,
      text: isFollowUp 
        ? "I'm reconsidering my assessment based on your feedback..."
        : "I'm analyzing this thread and any Jira tickets to assess the bug severity..."
    });
    
    // If this is a follow-up, use the existing conversation history
    if (isFollowUp && conversationMemory.messages) {
      const priorMessages = conversationMemory.messages;
      const slaGuidelines = await getMergedSlaGuidelines();

      const { text, message } = await assessSeverityWithJudge({
        threadContent: null,
        jiraTickets: null,
        slaGuidelines,
        userQuery,
        conversationHistory: priorMessages,
        threadSummary: `Follow-up in Slack thread. User message: ${userQuery}`,
        ticketDigest:
          conversationMemory.jiraTickets?.length > 0
            ? `Tickets in scope: ${conversationMemory.jiraTickets.join(', ')}`
            : 'Tickets not recorded in memory'
      });

      updateConversationMemory(event.channel, threadTs, {
        messages: [...priorMessages, { role: 'user', content: userQuery }, message]
      });
      
      // Post the response
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: text,
        parse: "full"
      });
      
      // Update processing message
      await client.chat.update({
        channel: event.channel,
        ts: processingMessage.ts,
        text: "I've reconsidered my assessment based on your feedback."
      });
      
      return;
    }
    
    // For a new assessment, proceed with the full analysis
    
    // Fetch the thread messages
    const threadResult = await client.conversations.replies({
      channel: event.channel,
      ts: threadTs,
      limit: 100 // Increase if you need to analyze longer threads
    });
    
    // Extract thread content, filtering out the bot's own messages
    const threadMessages = threadResult.messages
      .filter(m => m.user !== botUserId) // Filter out bot's own messages
      .map(m => {
        const timestamp = new Date(parseInt(m.ts.split('.')[0]) * 1000).toISOString();
        let userName = `<@${m.user}>`;
        // Try to extract the real name from user mentions if available
        const userMention = m.text.match(/<@([A-Z0-9]+)>/);
        if (userMention) {
          userName = userMention[0];
        }
        return `[${timestamp}] ${userName}: ${m.text}`;
      })
      .join('\n\n');
    
    // Extract Jira ticket IDs from thread
    const jiraTicketIds = new Set();
    threadResult.messages.forEach(message => {
      const ticketId = extractJiraTicketId(message.text);
      if (ticketId) jiraTicketIds.add(ticketId);
    });
    
    if (jiraTicketIds.size === 0) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "I couldn't find any Jira tickets in this thread. Please mention a Jira ticket (e.g., BUG-123) for me to assess severity."
      });
      return;
    }
    
    // Fetch details for each Jira ticket
    const jiraTicketsPromises = Array.from(jiraTicketIds).map(getJiraTicketDetails);
    const jiraTickets = await Promise.all(jiraTicketsPromises);
    
    // Check if any tickets failed to fetch
    const failedTickets = jiraTickets.filter(ticket => ticket.error);
    if (failedTickets.length > 0 && failedTickets.length === jiraTicketIds.size) {
      // All tickets failed
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: `I had trouble accessing the Jira ticket(s): ${failedTickets.map(t => t.id).join(', ')}. Please check that the tickets exist and that I have permission to view them.`
      });
      return;
    }
    
    const ticketDigest = jiraTickets
      .filter(t => !t.error)
      .map(t => `${t.id}: ${t.summary}`)
      .join('\n');

    const slaGuidelines = await getMergedSlaGuidelines();

    const { text, message } = await assessSeverityWithJudge({
      threadContent: threadMessages,
      jiraTickets,
      slaGuidelines,
      userQuery,
      conversationHistory: [],
      threadSummary: threadMessages,
      ticketDigest
    });
    
    // Save conversation context for follow-ups
    updateConversationMemory(event.channel, threadTs, {
      hasAssessment: true,
      jiraTickets: jiraTickets.map(t => t.id),
      messages: [
        { 
          role: "user", 
          content: `I need help assessing the severity of Jira ticket(s): ${Array.from(jiraTicketIds).join(', ')}` 
        },
        message
      ]
    });
    
    // Post the assessment back to the thread with Slack's "full" parsing mode
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: threadTs,
      text: `*Severity Assessment*\n\n${text}`,
      parse: "full"
    });
    
    // Update the processing message to indicate completion
    await client.chat.update({
      channel: event.channel,
      ts: processingMessage.ts,
        text: "Assessment complete. Please see my analysis below."
    });
    
  } catch (error) {
    logger.error('Error handling app_mention event:', error);
    
    // Notify about the error
    if (event.channel && event.ts) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: `I encountered an error while processing your request: ${error.message}`
      });
    }
  }
});

/**
 * Helper method to extract ticket IDs from a direct link to the bot
 * This handles cases where users right-click the bot and select "Talk to [bot]"
 */
slackApp.event('message', async ({ message, client, logger }) => {
  // Only process direct messages to the bot, not all messages
  if (message.channel_type !== 'im') return;
  
  // Skip messages from bots or message changed/deleted events
  if (message.bot_id || message.subtype) return;
  
  try {
    // Get conversation memory for this DM
    const conversationMemory = getConversationMemory(message.channel, "dm");
    
    // Check if this is a follow-up question
    const isFollowUp = isFollowUpQuestion(message.text, conversationMemory);
    
    if (isFollowUp && conversationMemory.messages) {
      const processingMessage = await client.chat.postMessage({
        channel: message.channel,
        text: "I'm reconsidering my assessment based on your feedback..."
      });

      const priorMessages = conversationMemory.messages;
      const slaGuidelines = await getMergedSlaGuidelines();

      const { text, message: newMessage } = await assessSeverityWithJudge({
        threadContent: null,
        jiraTickets: null,
        slaGuidelines,
        userQuery: message.text,
        conversationHistory: priorMessages,
        threadSummary: `Follow-up in DM. User message: ${message.text}`,
        ticketDigest:
          conversationMemory.jiraTickets?.length > 0
            ? `Tickets in scope: ${conversationMemory.jiraTickets.join(', ')}`
            : 'Tickets not recorded in memory'
      });

      updateConversationMemory(message.channel, "dm", {
        messages: [...priorMessages, { role: "user", content: message.text }, newMessage]
      });
      
      // Send the response
      await client.chat.postMessage({
        channel: message.channel,
        text: text,
        parse: "full"
      });
      
      // Update processing message
      await client.chat.update({
        channel: message.channel,
        ts: processingMessage.ts,
        text: "I've reconsidered my assessment based on your feedback."
      });
      
      return;
    }
    
    // Check if message contains a Jira ticket
    const ticketId = extractJiraTicketId(message.text);
    if (!ticketId) {
      await client.chat.postMessage({
        channel: message.channel,
        text: "Hello! I can help assess bug severity for Jira tickets. Please mention a ticket ID (e.g., BUG-123) and ask me to assess its severity."
      });
      return;
    }
    
    // Check if there's an assessment request
    if (!isAssessmentRequest(message.text)) {
      await client.chat.postMessage({
        channel: message.channel,
        text: `I see you've mentioned ticket ${ticketId}. Would you like me to assess its severity? Just ask me to "assess severity" or "evaluate this bug".`
      });
      return;
    }
    
    // Process a single ticket assessment in DM
    const processingMessage = await client.chat.postMessage({
      channel: message.channel,
      text: `I'm analyzing Jira ticket ${ticketId} to assess its severity...`
    });
    
    // Fetch the ticket details
    const ticketDetails = await getJiraTicketDetails(ticketId);
    
    if (ticketDetails.error) {
      await client.chat.postMessage({
        channel: message.channel,
        text: `I had trouble accessing the Jira ticket ${ticketId}: ${ticketDetails.error}`
      });
      return;
    }
    
    // Limited context since this is a DM without thread history
    const limitedContext = `User is asking for severity assessment of ticket ${ticketId} in a direct message.`;
    
    const ticketDigest = `${ticketDetails.id}: ${ticketDetails.summary}`;

    const slaGuidelines = await getMergedSlaGuidelines();

    const { text, message: botMessage } = await assessSeverityWithJudge({
      threadContent: limitedContext,
      jiraTickets: [ticketDetails],
      slaGuidelines,
      userQuery: message.text,
      conversationHistory: [],
      threadSummary: limitedContext,
      ticketDigest
    });
    
    // Save conversation context for follow-ups
    updateConversationMemory(message.channel, "dm", {
      hasAssessment: true,
      jiraTickets: [ticketId],
      messages: [
        { 
          role: "user", 
          content: `I need help assessing the severity of Jira ticket: ${ticketId}` 
        },
        botMessage
      ]
    });
    
    // Send the assessment with Slack's "full" parsing mode
    await client.chat.postMessage({
      channel: message.channel,
      text: `*Severity Assessment for ${ticketId}*\n\n${text}`,
      parse: "full"
    });
    
    // Update processing message
    await client.chat.update({
      channel: message.channel,
      ts: processingMessage.ts,
      text: "Assessment complete. Please see my analysis below."
    });
    
  } catch (error) {
    logger.error('Error handling direct message:', error);
    
    // Notify about the error
    await client.chat.postMessage({
      channel: message.channel,
      text: `I encountered an error while processing your request: ${error.message}`
    });
  }
});

module.exports = {};