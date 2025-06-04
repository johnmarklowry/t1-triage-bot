/**
 * botMentionHandler.js
 * Handles @mentions of the bot to assess bug severity based on thread content and Jira tickets
 */
const { slackApp } = require('./appHome');
const axios = require('axios');

// Load SLA guidelines from a configuration file
const SLA_GUIDELINES = require('./sla-guidelines.json');

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
          'Accept': 'application/json'
        }
      }
    );
    
    console.log(`Successfully retrieved data for ticket ${ticketId}`);
    
    // Extract relevant fields for severity assessment
    return {
      id: ticketId,
      summary: response.data.fields.summary,
      description: response.data.fields.description || 'No description provided',
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
 * Call OpenAI API to assess severity and recommend next steps
 */
async function assessSeverity(threadContent, jiraTickets, slaGuidelines, userQuery, conversationHistory = []) {
  try {
    // Format the jira tickets for readability, but only if they exist
    let formattedTickets = "";
    if (jiraTickets) {
      formattedTickets = jiraTickets.map(ticket => {
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
      }).join('\n\n----------\n\n');
    }

    // OpenAI API call
    const { OpenAI } = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Create messages array with conversation history
    const messages = [
      {
        role: "system",
        content: "You are a bug severity assessment expert for Lexus.com. You analyze issues and determine their Business Priority Level according to established SLA criteria. Format your responses for Slack: use *asterisks for bold* (not markdown headers with #), use simple bullet points with • symbols, and keep formatting simple. You can engage in a conversation about your assessment, explaining your reasoning or reconsidering your assessment if the user provides additional context or suggests a different severity level. Your assessments should be clear, structured, and focused on facts from the provided information."
      }
    ];
    
    // If this is a new assessment, add the full context
    if (conversationHistory.length === 0) {
      messages.push({
        role: "user",
        content: `
You are a bug severity assessment expert for the Lexus website team. You're analyzing a Slack conversation and Jira tickets to determine the appropriate severity level according to our Business Priority SLA.

SLACK THREAD CONTENT:
${threadContent || "No thread content provided"}

JIRA TICKET DETAILS:
${formattedTickets || "No ticket details available for this follow-up question"}

SLA GUIDELINES:
${slaGuidelines ? JSON.stringify(slaGuidelines, null, 2) : "Using SLA guidelines from previous context"}

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
      // For a follow-up, add the existing conversation
      messages.push(...conversationHistory);
      
      // Add the user's new query
      messages.push({
        role: "user",
        content: userQuery
      });
    }

    // Make the API call
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",  // Use the most capable model
      messages: messages,
      temperature: 0.2,  // Low temperature for more consistent, precise responses
      max_tokens: 1500
    });

    let formattedResponse = response.choices[0].message.content.trim();
    
    // Ensure Slack formatting even if the model doesn't follow instructions perfectly
    formattedResponse = formatForSlack(formattedResponse);
    
    return {
      text: formattedResponse,
      message: response.choices[0].message
    };
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return {
      text: `Error: Unable to assess severity at this time. ${error.message || "Please try again later."}`,
      message: { role: "assistant", content: `Error: ${error.message}` }
    };
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
        ? "I'm reconsidering my assessment based on your feedback... :thinking_face:"
        : "I'm analyzing this thread and any Jira tickets to assess the bug severity... :mag:"
    });
    
    // If this is a follow-up, use the existing conversation history
    if (isFollowUp && conversationMemory.messages) {
      // Add the new user query
      const messages = [...conversationMemory.messages, { 
        role: "user", 
        content: userQuery 
      }];
      
      // Get the response from OpenAI
      const { text, message } = await assessSeverity(
        null, // No need to send thread content again
        null, // No need to send Jira tickets again
        null, // No need to send SLA guidelines again
        userQuery,
        messages
      );
      
      // Update conversation memory with new message
      updateConversationMemory(event.channel, threadTs, {
        messages: [...messages, message]
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
        text: "✅ I've reconsidered my assessment based on your feedback."
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
    
    // Send to LLM for assessment
    const { text, message } = await assessSeverity(
      threadMessages, 
      jiraTickets, 
      SLA_GUIDELINES, 
      userQuery
    );
    
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
      text: "✅ Assessment complete! Please see my analysis below."
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
      // Process follow-up question
      const processingMessage = await client.chat.postMessage({
        channel: message.channel,
        text: "I'm reconsidering my assessment based on your feedback... :thinking_face:"
      });
      
      // Add the new user query
      const messages = [...conversationMemory.messages, { 
        role: "user", 
        content: message.text 
      }];
      
      // Get the response from OpenAI
      const { text, message: newMessage } = await assessSeverity(
        null, // No need to send content again
        null, // No need to send Jira tickets again
        null, // No need to send SLA guidelines again
        message.text,
        messages
      );
      
      // Update conversation memory with new message
      updateConversationMemory(message.channel, "dm", {
        messages: [...messages, newMessage]
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
        text: "✅ I've reconsidered my assessment based on your feedback."
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
      text: `I'm analyzing Jira ticket ${ticketId} to assess its severity... :mag:`
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
    
    // Call LLM to assess
    const { text, message: botMessage } = await assessSeverity(
      limitedContext, 
      [ticketDetails], 
      SLA_GUIDELINES,
      message.text
    );
    
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
      text: "✅ Assessment complete! Please see my analysis below."
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