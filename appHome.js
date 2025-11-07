/********************************
 * appHome.js
 * Updated to ensure consistent data handling
 ********************************/
require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Import centralized data utilities
const {
  readCurrentState,
  readSprints,
  readDisciplines,
  loadJSON,
  getSprintUsers,
  refreshCurrentState,
  OVERRIDES_FILE
} = require('./dataUtils');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Get upcoming sprints from today onward.
 */
async function getUpcomingSprints() {
  const allSprints = await readSprints();
  const today = dayjs().tz("America/Los_Angeles");
  // Filter sprints with startDate >= today
  return allSprints.filter(sprint => {
    return dayjs(sprint.startDate).tz("America/Los_Angeles").isAfter(today) || 
           dayjs(sprint.startDate).tz("America/Los_Angeles").isSame(today);
  });
}

/**
 * getOnCallForSprint:
 * For a given sprint index and role, determine the on-call user from disciplines.
 * Checks if an approved override exists in overrides.json and, if so, returns that user.
 * This is now just a wrapper around the centralized getSprintUsers function
 */
async function getOnCallForSprint(sprintIndex, role, disciplines) {
  const users = await getSprintUsers(sprintIndex);
  const userId = users[role];
  
  // Find the user details from disciplines
  const roleArray = disciplines[role] || [];
  const userObj = roleArray.find(u => u.slackId === userId);
  
  if (userObj) {
    return userObj;
  } else if (userId) {
    // Fallback: return an object with just the Slack ID
    return { slackId: userId, name: userId };
  }
  
  return null;
}

/**
 * Get the current on-call rotation.
 * Now ensures consistency by refreshing state if needed
 * @returns {Promise<Object|null>} Current rotation object or null if not found
 */
async function getCurrentOnCall() {
  try {
    // First, refresh the current state to ensure it matches calculations
    await refreshCurrentState();
    
    const currentState = await readCurrentState();
    const sprints = await readSprints();
    const disciplines = await readDisciplines();

    // Handle null/undefined sprint data gracefully
    if (!currentState || currentState.sprintIndex === null || !sprints || sprints.length === 0) {
      return null;
    }
    
    const curSprint = sprints[currentState.sprintIndex];
    if (!curSprint) {
      console.error('[getCurrentOnCall] Sprint not found for index:', currentState.sprintIndex);
      return null;
    }
    
    let users = [];
    for (let role of ["account", "producer", "po", "uiEng", "beEng"]) {
      const roleArray = disciplines[role] || [];
      // Find user object matching stored Slack ID
      const userObj = roleArray.find(u => u.slackId === currentState[role]);
      if (userObj) {
        users.push({ role, name: userObj.name, slackId: userObj.slackId });
      } else if (currentState[role]) {
        // Fallback: use the stored Slack ID as both name and slackId.
        console.warn(`[getCurrentOnCall] User ${currentState[role]} not found in ${role} discipline`);
        users.push({ role, name: currentState[role], slackId: currentState[role] });
      }
    }
    
    // Validate no duplicate users
    const userIds = users.map(u => u.slackId);
    const uniqueIds = new Set(userIds);
    if (userIds.length !== uniqueIds.size) {
      console.error('[getCurrentOnCall] WARNING: Duplicate users detected:', users);
    }
    
    return {
      sprintName: curSprint.sprintName,
      startDate: curSprint.startDate,
      endDate: curSprint.endDate,
      users
    };
  } catch (error) {
    console.error('[getCurrentOnCall] Error loading current rotation:', error);
    return null;
  }
}

/**
 * Get the next on-call rotation.
 * Uses the centralized getSprintUsers for consistency
 * @returns {Promise<Object|null>} Next rotation object or null if not found
 */
async function getNextOnCall() {
  try {
    const currentState = await readCurrentState();
    const sprints = await readSprints();
    const disciplines = await readDisciplines();

    // Handle null/undefined sprint data gracefully
    if (!currentState || currentState.sprintIndex === null) {
      return null;
    }
  
    const nextIndex = currentState.sprintIndex + 1;
    if (!sprints || nextIndex >= sprints.length) {
      return null;
    }
  
    const nextSprint = sprints[nextIndex];
    if (!nextSprint) {
      console.warn('[getNextOnCall] Next sprint not found for index:', nextIndex);
      return null;
    }
  
    // Use centralized function to get users for the next sprint
    const sprintUsers = await getSprintUsers(nextIndex);
  
    let users = [];
    for (let role of ["account", "producer", "po", "uiEng", "beEng"]) {
      const userId = sprintUsers[role];
      if (!userId) continue;
    
      const roleArray = disciplines[role] || [];
      const userObj = roleArray.find(u => u.slackId === userId);
    
      if (userObj) {
        users.push({ role, name: userObj.name, slackId: userObj.slackId });
      } else {
        console.warn(`[getNextOnCall] User ${userId} not found in ${role} discipline`);
        users.push({ role, name: userId, slackId: userId });
      }
    }
  
    return {
      sprintName: nextSprint.sprintName,
      startDate: nextSprint.startDate,
      endDate: nextSprint.endDate,
      users
    };
  } catch (error) {
    console.error('[getNextOnCall] Error loading next rotation:', error);
    return null;
  }
}

/**
 * Role display mapping for friendly names.
 */
const ROLE_DISPLAY = {
  account: "Account",
  producer: "Producer",
  po: "PO",
  uiEng: "UI Engineer",
  beEng: "BE Engineer"
};

/**
 * Build a header block with consistent styling.
 * 
 * Block Kit Best Practice: Header blocks provide clear visual hierarchy and are
 * more prominent than section blocks. Use for main section titles.
 * 
 * @param {string} text - The header text to display (max 150 characters per Slack API)
 * @returns {Object} Slack Block Kit header block with type 'header' and plain_text
 * @example
 * buildHeaderBlock('Current On-Call Rotation')
 * // Returns: { type: 'header', text: { type: 'plain_text', text: 'Current On-Call Rotation' } }
 */
function buildHeaderBlock(text) {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: text
    }
  };
}

/**
 * Build a context block with date/metadata information.
 * 
 * Block Kit Best Practice: Context blocks are ideal for displaying secondary information
 * like dates, timestamps, or metadata. They appear smaller and less prominent than
 * section blocks, perfect for supplementary information.
 * 
 * @param {string} text - The context text to display (typically formatted date range or metadata)
 * @returns {Object} Slack Block Kit context block with type 'context' and mrkdwn element
 * @example
 * buildContextBlock('Mon 01/01/2025 to Mon 01/14/2025')
 * // Returns: { type: 'context', elements: [{ type: 'mrkdwn', text: 'Mon 01/01/2025 to Mon 01/14/2025' }] }
 */
function buildContextBlock(text) {
  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: text
      }
    ]
  };
}

/**
 * Build Block Kit blocks for the current rotation section.
 * 
 * Block Kit Best Practices Applied:
 * - Header block for section title (visual hierarchy)
 * - Section block with fields array for compact display of sprint name and dates
 * - Context block for date range (secondary information)
 * - Individual section blocks for each user role (clear separation)
 * - All text uses mrkdwn formatting for rich text (bold, mentions)
 * 
 * Error Handling Pattern:
 * - Returns user-friendly message when current rotation is null
 * - Message: "_No active sprint found._" (not technical error)
 * - Allows home tab to display other sections even if current is missing
 * 
 * Accessibility: All blocks include descriptive text, not just emoji or icons.
 * 
 * @param {Object|null} cur - Current rotation data with sprintName, startDate, endDate, and users array, or null
 * @param {string} cur.sprintName - Name of the current sprint
 * @param {string} cur.startDate - Start date in YYYY-MM-DD format
 * @param {string} cur.endDate - End date in YYYY-MM-DD format
 * @param {Array<Object>} cur.users - Array of user objects with role, name, and slackId
 * @returns {Array<Object>} Array of Slack Block Kit blocks (header, section with fields, context, user sections)
 */
function buildCurrentRotationBlocks(cur) {
  if (!cur) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No active sprint found._' }
      }
    ];
  }

  const blocks = [];
  
  // Block Kit Best Practice: Use header blocks for section titles (visual hierarchy)
  blocks.push(buildHeaderBlock('Current On-Call Rotation'));
  
  // Block Kit Best Practice: Use section blocks with fields array for compact side-by-side display
  // Format dates consistently using Pacific Time timezone
  const startFormatted = dayjs(`${cur.startDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  const endFormatted = dayjs(`${cur.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Sprint:*\n${cur.sprintName}` // Bold label for accessibility
      },
      {
        type: 'mrkdwn',
        text: `*Start Date:*\n${startFormatted}` // Bold label for accessibility
      },
      {
        type: 'mrkdwn',
        text: `*End Date:*\n${endFormatted}` // Bold label for accessibility
      }
    ]
  });
  
  // Block Kit Best Practice: Use context blocks for secondary metadata (dates, timestamps)
  blocks.push(buildContextBlock(`${startFormatted} to ${endFormatted}`));
  
  // Block Kit Best Practice: Individual section blocks for each user role (clear separation)
  // Sort users by role order for consistent display
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  const sortedUsers = cur.users.sort((a, b) => {
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });
  
  // Accessibility: Each block includes descriptive text (role name + user name + mention)
  // Not just emoji or icons - screen readers can understand the content
  sortedUsers.forEach(u => {
    const displayRole = ROLE_DISPLAY[u.role] || u.role;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${displayRole}:* ${u.name} (<@${u.slackId}>)` // Bold role, name, and mention
      }
    });
  });
  
  return blocks;
}

/**
 * Build Block Kit blocks for the next rotation section.
 * 
 * Block Kit Best Practices Applied:
 * - Header block for section title (visual hierarchy)
 * - Section block with fields array for compact display of sprint name and dates
 * - Context block for date range (secondary information)
 * - Individual section blocks for each user role (clear separation)
 * - All text uses mrkdwn formatting for rich text (bold, mentions)
 * 
 * Error Handling Pattern:
 * - Returns user-friendly message when next rotation is null
 * - Message: "_No upcoming sprint scheduled._" (not technical error)
 * - Allows home tab to display other sections even if next is missing
 * 
 * Accessibility: All blocks include descriptive text, not just emoji or icons.
 * 
 * @param {Object|null} nxt - Next rotation data with sprintName, startDate, endDate, and users array, or null
 * @param {string} nxt.sprintName - Name of the next sprint
 * @param {string} nxt.startDate - Start date in YYYY-MM-DD format
 * @param {string} nxt.endDate - End date in YYYY-MM-DD format
 * @param {Array<Object>} nxt.users - Array of user objects with role, name, and slackId
 * @returns {Array<Object>} Array of Slack Block Kit blocks (header, section with fields, context, user sections)
 */
function buildNextRotationBlocks(nxt) {
  if (!nxt) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No upcoming sprint scheduled._' }
      }
    ];
  }

  const blocks = [];
  
  // Header block for section title
  blocks.push(buildHeaderBlock('Next On-Call Rotation'));
  
  // Section block with fields for sprint name and dates
  const startFormatted = dayjs(`${nxt.startDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  const endFormatted = dayjs(`${nxt.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Sprint:*\n${nxt.sprintName}`
      },
      {
        type: 'mrkdwn',
        text: `*Start Date:*\n${startFormatted}`
      },
      {
        type: 'mrkdwn',
        text: `*End Date:*\n${endFormatted}`
      }
    ]
  });
  
  // Context block for date range
  blocks.push(buildContextBlock(`${startFormatted} to ${endFormatted}`));
  
  // Section blocks for user roles
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  const sortedUsers = nxt.users.sort((a, b) => {
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });
  
  sortedUsers.forEach(u => {
    const displayRole = ROLE_DISPLAY[u.role] || u.role;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${displayRole}:* ${u.name} (<@${u.slackId}>)`
      }
    });
  });
  
  return blocks;
}

/**
 * Build a fallback view when data is completely unavailable.
 * Provides user-friendly error message and guidance.
 * 
 * Error Handling Pattern:
 * - Used when all data sources fail (current, next, disciplines all null)
 * - Displays user-friendly message (not technical error details)
 * - Includes timestamp for debugging
 * - Provides actionable guidance (contact administrator)
 * 
 * @param {string} errorMessage - Optional error message to display
 * @param {string} errorSource - Optional source of error (e.g., 'database', 'json')
 * @returns {Object} Home view object with error message
 */
function buildFallbackView(errorMessage = null, errorSource = null) {
  let message = 'Unable to load rotation data at this time.';
  if (errorMessage) {
    message = errorMessage;
  } else if (errorSource) {
    message = `Unable to load rotation data from ${errorSource}. Please try again later.`;
  }
  
  return {
    type: 'home',
    callback_id: 'triage_app_home',
    blocks: [
      buildHeaderBlock('Welcome to the Triage Rotation App Home!'),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: ${message}\n\nIf this issue persists, please contact your administrator.`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Last updated: ' + new Date().toLocaleString()
          }
        ]
      }
    ]
  };
}

/**
 * Build Block Kit blocks for the discipline rotation lists section.
 * 
 * Block Kit Best Practices Applied:
 * - Header block for section title (visual hierarchy)
 * - Section blocks for each discipline with user lists
 * - Uses mrkdwn formatting for role names (bold) and user mentions
 * - Maintains consistent formatting across all disciplines
 * 
 * Error Handling Pattern:
 * - Returns user-friendly message when disciplines are null/empty
 * - Checks for empty arrays within disciplines object
 * - Validates that at least one discipline has data before displaying
 * 
 * Accessibility: All blocks include descriptive text with role names and user names,
 * not just emoji or icons. User mentions are properly formatted for screen readers.
 * 
 * @param {Object|null} discObj - Disciplines object with role arrays, or null
 * @param {Array<Object>} [discObj.account] - Array of account discipline users
 * @param {Array<Object>} [discObj.producer] - Array of producer discipline users
 * @param {Array<Object>} [discObj.po] - Array of PO discipline users
 * @param {Array<Object>} [discObj.uiEng] - Array of UI Engineer discipline users
 * @param {Array<Object>} [discObj.beEng] - Array of BE Engineer discipline users
 * @param {string} discObj[].name - User's display name
 * @param {string} discObj[].slackId - User's Slack ID for mentions
 * @returns {Array<Object>} Array of Slack Block Kit blocks (header + discipline sections)
 */
function buildDisciplineBlocks(discObj) {
  if (!discObj || Object.keys(discObj).length === 0) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Discipline Rotation Lists*\n_Discipline data unavailable._'
        }
      }
    ];
  }
  
  const blocks = [];
  // Block Kit Best Practice: Use header blocks for section titles (visual hierarchy)
  blocks.push(buildHeaderBlock('Discipline Rotation Lists'));
  
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  let hasAnyDisciplines = false;
  
  roleOrder.forEach(role => {
    if (!discObj[role] || !Array.isArray(discObj[role]) || discObj[role].length === 0) {
      return;
    }
    
    hasAnyDisciplines = true;
    const displayRole = ROLE_DISPLAY[role] || role;
    
    // Build user list text for this discipline
    // Accessibility: Include user names and mentions (not just IDs or emoji)
    let userListText = '';
    discObj[role].forEach(u => {
      userListText += `${u.name} (<@${u.slackId}>)\n`; // Name + mention for accessibility
    });
    
    // Block Kit Best Practice: Use section blocks with mrkdwn for formatted lists
    // Bold role name for visual hierarchy and accessibility
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${displayRole}*\n${userListText}` // Bold role name, then user list
      }
    });
  });
  
  if (!hasAnyDisciplines) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Discipline Rotation Lists*\n_Discipline data unavailable._'
        }
      }
    ];
  }
  
  return blocks;
}

/**
 * Build the App Home view using Block Kit.
 * 
 * This function constructs a complete Slack App Home view following Block Kit best practices:
 * - Uses header blocks for section titles (improves visual hierarchy)
 * - Uses section blocks with fields for compact, organized information display
 * - Uses context blocks for metadata (dates, timestamps)
 * - Uses divider blocks to separate major sections
 * - Uses action blocks for interactive elements (buttons)
 * - Handles null/empty data gracefully with user-friendly messages
 * 
 * Block Kit Best Practices Applied:
 * 1. Visual Hierarchy: Header blocks for main sections, section blocks for content
 * 2. Compact Display: Section blocks with fields array for side-by-side information
 * 3. Contextual Information: Context blocks for dates and metadata
 * 4. Accessibility: All blocks include descriptive text (not just emoji)
 * 5. Block Limit: Total blocks stay well under Slack's 50 block limit
 * 6. Error Handling: Graceful degradation when data is missing
 * 
 * Block Count Verification (max 50 blocks per Slack API limit):
 * - Main header: 1
 * - Actions block: 1
 * - Dividers: 3
 * - Current rotation: ~8 blocks (header + section + context + 5 user sections)
 * - Next rotation: ~8 blocks (header + section + context + 5 user sections)
 * - Discipline lists: ~6 blocks (header + 5 discipline sections)
 * Total: ~27 blocks (well under 50 block limit)
 * 
 * Performance Considerations:
 * - Block generation is synchronous and fast (no async operations)
 * - All data processing happens before this function is called
 * - Block structure is optimized for Slack's rendering engine
 * 
 * @param {Object|null} current - Current rotation data with sprintName, startDate, endDate, and users array, or null
 * @param {Object|null} next - Next rotation data with sprintName, startDate, endDate, and users array, or null
 * @param {Object|null} disciplines - Discipline object with role arrays (account, producer, po, uiEng, beEng), or null
 * @returns {Object} Slack Block Kit home view object with type 'home', callback_id, and blocks array
 * @example
 * const current = { sprintName: 'Sprint 1', startDate: '2025-01-01', endDate: '2025-01-14', users: [...] };
 * const next = { sprintName: 'Sprint 2', startDate: '2025-01-15', endDate: '2025-01-28', users: [...] };
 * const disciplines = { account: [...], producer: [...], ... };
 * const homeView = buildHomeView(current, next, disciplines);
 */
function buildHomeView(current, next, disciplines) {
  const currentBlocks = buildCurrentRotationBlocks(current);
  const nextBlocks = buildNextRotationBlocks(next);
  const disciplineBlocks = buildDisciplineBlocks(disciplines);

  const blocks = [
    // Header block for main title
    buildHeaderBlock('Welcome to the Triage Rotation App Home!'),
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View All Upcoming Sprints' },
          style: 'primary',
          action_id: 'open_upcoming_sprints'
        }
      ]
    },
    { type: 'divider' },
    ...currentBlocks,
    { type: 'divider' },
    ...nextBlocks,
    { type: 'divider' },
    ...disciplineBlocks
  ];

  // Verify block count doesn't exceed Slack API limit
  if (blocks.length > 50) {
    console.warn(`[buildHomeView] WARNING: Block count (${blocks.length}) exceeds Slack API limit of 50 blocks`);
  }

  return {
    type: 'home',
    callback_id: 'triage_app_home',
    blocks
  };
}

/**
 * Format the Current On-Call Rotation section.
 * Handles null/empty current rotation with user-friendly message.
 * @param {Object|null} cur - Current rotation object or null
 * @returns {string} Formatted markdown text
 */
function formatCurrentText(cur) {
  if (!cur) return '_No active sprint found._';
  
  // Format dates properly by adding T00:00:00 to ensure they're interpreted as midnight PT
  const startFormatted = dayjs(`${cur.startDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  const endFormatted = dayjs(`${cur.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  
  let text = '*Current On-Call Rotation*\n';
  text += `*${cur.sprintName}*\nDates: ${startFormatted} to ${endFormatted}\n\n`;
  
  // Sort users by role order for consistent display
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  const sortedUsers = cur.users.sort((a, b) => {
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });
  
  sortedUsers.forEach(u => {
    const displayRole = ROLE_DISPLAY[u.role] || u.role;
    text += `*${displayRole}*: ${u.name} (<@${u.slackId}>)\n`;
  });
  
  return text;
}

/**
 * Build Block Kit blocks for the current rotation section.
 * Uses header block, section blocks with fields for dates, context block for date range,
 * and section blocks for user roles.
 * @param {Object} cur - Current rotation data with sprintName, startDate, endDate, and users array
 * @returns {Array<Object>} Array of Slack Block Kit blocks
 */
function buildCurrentRotationBlocks(cur) {
  if (!cur) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No active sprint found._' }
      }
    ];
  }

  const blocks = [];
  
  // Header block for section title
  blocks.push(buildHeaderBlock('Current On-Call Rotation'));
  
  // Section block with fields for sprint name and dates
  const startFormatted = dayjs(`${cur.startDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  const endFormatted = dayjs(`${cur.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Sprint:*\n${cur.sprintName}`
      },
      {
        type: 'mrkdwn',
        text: `*Start Date:*\n${startFormatted}`
      },
      {
        type: 'mrkdwn',
        text: `*End Date:*\n${endFormatted}`
      }
    ]
  });
  
  // Context block for date range
  blocks.push(buildContextBlock(`${startFormatted} to ${endFormatted}`));
  
  // Section blocks for user roles
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  const sortedUsers = cur.users.sort((a, b) => {
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });
  
  sortedUsers.forEach(u => {
    const displayRole = ROLE_DISPLAY[u.role] || u.role;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${displayRole}:* ${u.name} (<@${u.slackId}>)`
      }
    });
  });
  
  return blocks;
}

/**
 * Format the Next On-Call Rotation section.
 * Handles null/empty next rotation with user-friendly message.
 * @param {Object|null} nxt - Next rotation object or null
 * @returns {string} Formatted markdown text
 */
function formatNextText(nxt) {
  if (!nxt) return '_No upcoming sprint scheduled._';
  
  // Format dates properly by adding T00:00:00 to ensure they're interpreted as midnight PT
  const startFormatted = dayjs(`${nxt.startDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  const endFormatted = dayjs(`${nxt.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  
  let text = '*Next On-Call Rotation*\n';
  text += `*${nxt.sprintName}*\nDates: ${startFormatted} to ${endFormatted}\n\n`;
  
  // Sort users by role order for consistent display
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  const sortedUsers = nxt.users.sort((a, b) => {
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });
  
  sortedUsers.forEach(u => {
    const displayRole = ROLE_DISPLAY[u.role] || u.role;
    text += `*${displayRole}*: ${u.name} (<@${u.slackId}>)\n`;
  });
  
  return text;
}

/**
 * Build Block Kit blocks for the next rotation section.
 * Uses header block, section blocks with fields for dates, context block for date range,
 * and section blocks for user roles.
 * @param {Object} nxt - Next rotation data with sprintName, startDate, endDate, and users array
 * @returns {Array<Object>} Array of Slack Block Kit blocks
 */
function buildNextRotationBlocks(nxt) {
  if (!nxt) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No upcoming sprint scheduled._' }
      }
    ];
  }

  const blocks = [];
  
  // Block Kit Best Practice: Use header blocks for section titles (visual hierarchy)
  blocks.push(buildHeaderBlock('Next On-Call Rotation'));
  
  // Block Kit Best Practice: Use section blocks with fields array for compact side-by-side display
  // Format dates consistently using Pacific Time timezone
  const startFormatted = dayjs(`${nxt.startDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  const endFormatted = dayjs(`${nxt.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Sprint:*\n${nxt.sprintName}` // Bold label for accessibility
      },
      {
        type: 'mrkdwn',
        text: `*Start Date:*\n${startFormatted}` // Bold label for accessibility
      },
      {
        type: 'mrkdwn',
        text: `*End Date:*\n${endFormatted}` // Bold label for accessibility
      }
    ]
  });
  
  // Block Kit Best Practice: Use context blocks for secondary metadata (dates, timestamps)
  blocks.push(buildContextBlock(`${startFormatted} to ${endFormatted}`));
  
  // Block Kit Best Practice: Individual section blocks for each user role (clear separation)
  // Sort users by role order for consistent display
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  const sortedUsers = nxt.users.sort((a, b) => {
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });
  
  // Accessibility: Each block includes descriptive text (role name + user name + mention)
  // Not just emoji or icons - screen readers can understand the content
  sortedUsers.forEach(u => {
    const displayRole = ROLE_DISPLAY[u.role] || u.role;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${displayRole}:* ${u.name} (<@${u.slackId}>)` // Bold role, name, and mention
      }
    });
  });
  
  return blocks;
}

/**
 * Build Block Kit blocks for the discipline rotation lists section.
 * Uses header block and section blocks with fields for better formatting.
 * @param {Object} discObj - Discipline object with role arrays containing user objects
 * @returns {Array<Object>} Array of Slack Block Kit blocks
 */
function buildDisciplineBlocks(discObj) {
  if (!discObj || Object.keys(discObj).length === 0) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No discipline data available._' }
      }
    ];
  }

  const blocks = [];
  
  // Header block for section title
  blocks.push(buildHeaderBlock('Discipline Rotation Lists'));
  
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  let hasAnyDisciplines = false;
  
  roleOrder.forEach(role => {
    if (!discObj[role] || !Array.isArray(discObj[role]) || discObj[role].length === 0) {
      return;
    }
    
    hasAnyDisciplines = true;
    const displayRole = ROLE_DISPLAY[role] || role;
    
    // Build user list text for this discipline
    const userList = discObj[role].map(u => `${u.name} (<@${u.slackId}>)`).join('\n');
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${displayRole}*\n${userList}`
      }
    });
  });
  
  if (!hasAnyDisciplines) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No discipline data available._' }
      }
    ];
  }
  
  return blocks;
}

/**
 * Format the Discipline Rotation Lists.
 * @deprecated Use buildDisciplineBlocks() instead. This function is kept for backward compatibility.
 */
function formatDisciplines(discObj) {
  if (!discObj || Object.keys(discObj).length === 0) {
    return '_Discipline data unavailable._';
  }
  
  let text = '*Discipline Rotation Lists*\n';
  
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  let hasAnyDisciplines = false;
  
  roleOrder.forEach(role => {
    if (!discObj[role] || !Array.isArray(discObj[role]) || discObj[role].length === 0) {
      return;
    }
    
    hasAnyDisciplines = true;
    const displayRole = ROLE_DISPLAY[role] || role;
    text += `\n*${displayRole}*\n`;
    discObj[role].forEach(u => {
      text += `    ${u.name} (<@${u.slackId}>)\n`;
    });
  });
  
  if (!hasAnyDisciplines) {
    return '_Discipline data unavailable._';
  }
  
  return text;
}

/**
 * buildUpcomingSprintsModal:
 * Builds a modal view that lists upcoming sprints with their on-call rotations
 * @returns {Promise<Object>} Modal view object
 */
async function buildUpcomingSprintsModal() {
  try {
    // Load data asynchronously
    const currentState = await readCurrentState();
    const allSprints = await readSprints();
    const disciplines = await readDisciplines();

    let upcomingSprints = [];
    let startingIndex = 0;
    if (currentState && currentState.sprintIndex !== null) {
      startingIndex = currentState.sprintIndex;
      upcomingSprints = allSprints.slice(startingIndex);
    } else {
      // Fallback: use all sprints with a start date on or after today
      const today = dayjs().tz("America/Los_Angeles");
      upcomingSprints = allSprints.filter(sprint =>
        dayjs(sprint.startDate).tz("America/Los_Angeles").isAfter(today) || 
        dayjs(sprint.startDate).tz("America/Los_Angeles").isSame(today)
      );
      startingIndex = 0;
    }

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "Upcoming Sprints & Rotations" }
      },
      { type: "divider" }
    ];

    // For each upcoming sprint, compute the actual sprint index in the full sprints array.
    for (let i = 0; i < upcomingSprints.length; i++) {
      const sprint = upcomingSprints[i];
      const actualIndex = startingIndex + i;
      // Format dates properly by adding T00:00:00 to ensure they're interpreted as midnight PT
      const startFormatted = dayjs(`${sprint.startDate}T00:00:00-07:00`).format('ddd MM/DD/YYYY');
      const endFormatted = dayjs(`${sprint.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
      
      let rotationText = "";
      for (const role of ["account", "producer", "po", "uiEng", "beEng"]) {
        const user = await getOnCallForSprint(actualIndex, role, disciplines);
        const displayRole = ROLE_DISPLAY[role] || role;
        if (user) {
          rotationText += `*${displayRole}*: ${user.name} (<@${user.slackId}>)\n`;
        } else {
          rotationText += `*${displayRole}*: _Unassigned_\n`;
        }
      }

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${sprint.sprintName}*\nDates: ${startFormatted} to ${endFormatted}\n${rotationText}`
        }
      });
      blocks.push({ type: "divider" });
    }

    return {
      type: "modal",
      callback_id: "upcoming_sprints_modal",
      title: { type: "plain_text", text: "Upcoming Sprints" },
      submit: { type: "plain_text", text: "Close" },
      close: { type: "plain_text", text: "Cancel" },
      blocks
    };
  } catch (error) {
    console.error('[buildUpcomingSprintsModal] Error building modal:', error);
    // Return a fallback modal with error message
    return {
      type: "modal",
      callback_id: "upcoming_sprints_modal",
      title: { type: "plain_text", text: "Upcoming Sprints" },
      close: { type: "plain_text", text: "Close" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Error loading upcoming sprints*\nPlease try again later."
          }
        }
      ]
    };
  }
}

// Create a custom ExpressReceiver with endpoint /slack/events
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events'
});

// Create the Bolt app using the custom receiver
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

/**
 * Action handler: Open Upcoming Sprints Modal.
 */
slackApp.action('open_upcoming_sprints', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const modalView = await buildUpcomingSprintsModal();
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modalView
    });
  } catch (error) {
    logger.error("Error opening upcoming sprints modal:", error);
  }
});

/**
 * Listen for the app_home_opened event and publish the App Home view.
 * Enhanced with comprehensive error handling, partial data support, and error context logging.
 */
slackApp.event('app_home_opened', async ({ event, client, logger }) => {
  let current = null;
  let next = null;
  let disciplines = null;
  let dataLoadErrors = [];
  let errorSource = null;
  
  try {
    // Try to load all data in parallel for better performance
    // Each load is wrapped in try-catch to handle partial failures
    const loadPromises = [
      (async () => {
        try {
          current = await getCurrentOnCall();
        } catch (error) {
          logger.error('[app_home_opened] Error loading current rotation:', error);
          dataLoadErrors.push({ source: 'current rotation', error: error.message });
          errorSource = errorSource || 'database';
        }
      })(),
      (async () => {
        try {
          next = await getNextOnCall();
        } catch (error) {
          logger.error('[app_home_opened] Error loading next rotation:', error);
          dataLoadErrors.push({ source: 'next rotation', error: error.message });
          errorSource = errorSource || 'database';
        }
      })(),
      (async () => {
        try {
          disciplines = await readDisciplines();
        } catch (error) {
          logger.error('[app_home_opened] Error loading disciplines:', error);
          dataLoadErrors.push({ source: 'disciplines', error: error.message });
          errorSource = errorSource || 'database';
        }
      })()
    ];
    
    await Promise.all(loadPromises);
    
    // If all data loading failed, show fallback view
    if (current === null && next === null && disciplines === null) {
      logger.warn('[app_home_opened] All data sources failed, showing fallback view', {
        errors: dataLoadErrors,
        errorSource
      });
      
      const fallbackView = buildFallbackView(
        'Unable to load rotation data. Please try again later.',
        errorSource || 'data source'
      );
      
      await client.views.publish({
        user_id: event.user,
        view: fallbackView
      });
      return;
    }
    
    // Log warnings for partial data scenarios
    if (dataLoadErrors.length > 0) {
      logger.warn('[app_home_opened] Partial data loaded with errors:', {
        errors: dataLoadErrors,
        hasCurrent: current !== null,
        hasNext: next !== null,
        hasDisciplines: disciplines !== null,
        errorSource
      });
    } else {
      // Log successful data loading
      logger.info('[app_home_opened] Successfully loaded home tab data', {
        hasCurrent: current !== null,
        hasNext: next !== null,
        hasDisciplines: disciplines !== null
      });
    }
    
    // Build and publish home view with available data
    // buildHomeView handles null values gracefully
    const homeView = buildHomeView(current, next, disciplines);
    await client.views.publish({
      user_id: event.user,
      view: homeView
    });
    
  } catch (error) {
    // Complete failure - show fallback view
    logger.error('[app_home_opened] Complete failure publishing App Home view:', {
      error: error.message,
      stack: error.stack,
      errorSource: errorSource || 'unknown'
    });
    
    try {
      const fallbackView = buildFallbackView(
        'An error occurred while loading the home tab. Please try again later.',
        errorSource || 'system'
      );
      
      await client.views.publish({
        user_id: event.user,
        view: fallbackView
      });
    } catch (publishError) {
      logger.error('[app_home_opened] Failed to publish fallback view:', publishError);
    }
  }
});

// Export the Slack Bolt app and its receiver for integration with server.js
// Also export view building functions for testing
module.exports = { 
  slackApp, 
  receiver,
  buildHomeView,
  buildFallbackView,
  getCurrentOnCall,
  getNextOnCall
};