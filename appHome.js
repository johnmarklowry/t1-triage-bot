/********************************
 * appHome.js
 * Updated to ensure consistent data handling
 ********************************/
require('./loadEnv').loadEnv();
const { App, ExpressReceiver } = require('@slack/bolt');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Import centralized data utilities
const {
  readCurrentState,
  readSprints,
  readDisciplines,
  readOverrides,
  loadJSON,
  getSprintUsers,
  refreshCurrentState,
  OVERRIDES_FILE
} = require('./dataUtils');

// Import environment-specific command utilities
const { getEnvironmentCommand } = require('./commandUtils');

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
async function getOnCallForSprint(sprintIndex=0, role, disciplines) {
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
 * Role icons for visual distinction
 */
const ROLE_ICONS = {
  account: "👤",
  producer: "🎬",
  po: "📋",
  uiEng: "🎨",
  beEng: "⚙️"
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
 * Format time remaining until a date
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {string} Formatted time remaining (e.g., "2 days, 5 hours remaining" or "Ends today")
 */
function formatTimeRemaining(endDate) {
  const end = dayjs(`${endDate}T23:59:59-07:00`).tz("America/Los_Angeles");
  const now = dayjs().tz("America/Los_Angeles");
  const diff = end.diff(now);
  
  if (diff < 0) {
    return "Ended";
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days === 0 && hours === 0) {
    return `Ends in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (days === 0) {
    return `Ends in ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (days === 1) {
    return `Ends tomorrow`;
  } else {
    return `${days} day${days !== 1 ? 's' : ''} remaining`;
  }
}

/**
 * Format days until a date
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {string} Formatted days until (e.g., "In 3 days" or "Starts tomorrow")
 */
function formatDaysUntil(startDate) {
  const start = dayjs(`${startDate}T00:00:00-07:00`).tz("America/Los_Angeles");
  const now = dayjs().tz("America/Los_Angeles");
  const days = start.diff(now, 'day');
  
  if (days < 0) {
    return "Started";
  } else if (days === 0) {
    return "Starts today";
  } else if (days === 1) {
    return "Starts tomorrow";
  } else {
    return `In ${days} days`;
  }
}

/**
 * Get user's on-call status for current rotation
 * @param {string} userId - Slack user ID
 * @param {Object|null} currentRotation - Current rotation object or null
 * @returns {Object|null} Status object with { isOnCall, role, timeRemaining } or null
 */
function getUserOnCallStatus(userId, currentRotation) {
  if (!currentRotation || !userId) {
    return null;
  }
  
  const userOnCall = currentRotation.users.find(u => u.slackId === userId);
  if (!userOnCall) {
    return null;
  }
  
  return {
    isOnCall: true,
    role: userOnCall.role,
    roleDisplay: ROLE_DISPLAY[userOnCall.role] || userOnCall.role,
    timeRemaining: formatTimeRemaining(currentRotation.endDate),
    sprintName: currentRotation.sprintName,
    endDate: currentRotation.endDate
  };
}

/**
 * Get user's upcoming shifts (sprints where they are scheduled)
 * @param {string} userId - Slack user ID
 * @param {Array} sprints - Array of all sprints
 * @param {Object} disciplines - Disciplines object with role arrays
 * @returns {Promise<Array>} Array of upcoming shift objects
 */
async function getUserUpcomingShifts(userId, sprints, disciplines) {
  if (!userId || !sprints || !disciplines) {
    return [];
  }
  
  // Find which role the user is in
  let userRole = null;
  let userIndex = -1;
  
  for (const [role, roleList] of Object.entries(disciplines)) {
    const index = roleList.findIndex(u => u.slackId === userId);
    if (index !== -1) {
      userRole = role;
      userIndex = index;
      break;
    }
  }
  
  if (!userRole || userIndex === -1) {
    return [];
  }
  
  const roleList = disciplines[userRole];
  const upcomingShifts = [];
  const today = dayjs().tz("America/Los_Angeles");
  
  // Check each sprint to see if user is scheduled
  for (let i = 0; i < sprints.length; i++) {
    const sprint = sprints[i];
    const sprintStart = dayjs(sprint.startDate).tz("America/Los_Angeles");
    
    // Only include future sprints
    if (sprintStart.isAfter(today) || sprintStart.isSame(today, 'day')) {
      // Calculate if user is assigned to this sprint
      const assignedIndex = i % roleList.length;
      if (assignedIndex === userIndex) {
        // Check for overrides
        const overrides = await readOverrides();
        const override = overrides.find(o =>
          o.sprintIndex === i &&
          o.role === userRole &&
          o.approved === true
        );
        
        // If there's an approved override replacing this user, skip it
        if (override && override.newSlackId !== userId) {
          continue;
        }
        
        upcomingShifts.push({
          sprintIndex: i,
          sprintName: sprint.sprintName,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          role: userRole,
          roleDisplay: ROLE_DISPLAY[userRole] || userRole,
          daysUntil: formatDaysUntil(sprint.startDate)
        });
      }
    }
  }
  
  return upcomingShifts.slice(0, 5); // Limit to next 5 shifts
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
/**
 * Build compact rotation card showing all roles in a grid layout
 * @param {Object} rotation - Rotation object with users array
 * @param {string|null} highlightUserId - User ID to highlight (if they're in this rotation)
 * @returns {Array<Object>} Array of Block Kit blocks
 */
function buildCompactRotationCard(rotation, highlightUserId = null) {
  if (!rotation) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No rotation data available._' }
      }
    ];
  }
  
  const blocks = [];
  const startFormatted = dayjs(`${rotation.startDate}T00:00:00-07:00`).format("MMM D");
  const endFormatted = dayjs(`${rotation.endDate}T00:00:00-07:00`).format("MMM D");
  
  // Header with sprint info
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${rotation.sprintName}* • ${startFormatted} - ${endFormatted}`
    }
  });
  
  // Build compact role display using fields (2 roles per row)
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  const sortedUsers = rotation.users.sort((a, b) => {
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });
  
  // Group users into pairs for fields display
  const fields = [];
  sortedUsers.forEach(u => {
    const displayRole = ROLE_DISPLAY[u.role] || u.role;
    const icon = ROLE_ICONS[u.role] || '';
    const isHighlighted = highlightUserId && u.slackId === highlightUserId;
    const prefix = isHighlighted ? '👉 ' : '';
    fields.push({
      type: 'mrkdwn',
      text: `${prefix}${icon} *${displayRole}:*\n<@${u.slackId}>`
    });
  });
  
  // Split into groups of 2 for fields (max 10 fields per section)
  for (let i = 0; i < fields.length; i += 2) {
    blocks.push({
      type: 'section',
      fields: fields.slice(i, i + 2)
    });
  }
  
  return blocks;
}

function buildCurrentRotationBlocks(cur, highlightUserId = null) {
  if (!cur || !cur.users || cur.users.length === 0) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No active sprint found._' }
      }
    ];
  }

  const blocks = [];
  
  // Block Kit Best Practice: Use header blocks for section titles (visual hierarchy)
  blocks.push(buildHeaderBlock('Currently On Call'));
  
  // Add context about the active sprint
  const startFormatted = dayjs(`${cur.startDate}T00:00:00-07:00`).format("MMM D, YYYY");
  const endFormatted = dayjs(`${cur.endDate}T00:00:00-07:00`).format("MMM D, YYYY");
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${cur.sprintName}*\n📅 ${startFormatted} - ${endFormatted} • ⏰ ${formatTimeRemaining(cur.endDate)}`
    }
  });
  
  blocks.push({ type: 'divider' });
  
  // Use compact rotation card to show all team members
  blocks.push(...buildCompactRotationCard(cur, highlightUserId));
  
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
function buildNextRotationBlocks(nxt, highlightUserId = null) {
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
  blocks.push(buildHeaderBlock('Next Sprint'));
  
  // Use compact rotation card
  blocks.push(...buildCompactRotationCard(nxt, highlightUserId));
  
  // Add days until context
  blocks.push(buildContextBlock(`📅 ${formatDaysUntil(nxt.startDate)}`));
  
  return blocks;
}

/**
 * Build personal status card (hero section)
 * Shows user's current on-call status or next shift preview
 * @param {string} userId - Slack user ID
 * @param {Object|null} onCallStatus - Status from getUserOnCallStatus or null
 * @param {Object|null} nextShift - First upcoming shift from getUserUpcomingShifts or null
 * @returns {Array<Object>} Array of Block Kit blocks for personal status card
 */
function buildPersonalStatusCard(userId, onCallStatus, nextShift) {
  const blocks = [];
  
  if (onCallStatus) {
    // User is currently on call
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🟢 *You are currently on call*\n*Role:* ${onCallStatus.roleDisplay} | *Sprint:* ${onCallStatus.sprintName}\n*Time remaining:* ${onCallStatus.timeRemaining}`
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Request Coverage', emoji: true },
        style: 'primary',
        action_id: 'request_coverage_from_home',
        value: JSON.stringify({ userId })
      }
    });
  } else if (nextShift) {
    // User has upcoming shift
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⏰ *Your next shift*\n*Role:* ${nextShift.roleDisplay} | *Sprint:* ${nextShift.sprintName}\n*${nextShift.daysUntil}* • ${dayjs(`${nextShift.startDate}T00:00:00-07:00`).format("MMM D")} - ${dayjs(`${nextShift.endDate}T00:00:00-07:00`).format("MMM D")}`
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Request Coverage', emoji: true },
        style: 'primary',
        action_id: 'request_coverage_from_home',
        value: JSON.stringify({ userId, sprintIndex: nextShift.sprintIndex })
      }
    });
  } else {
    // User has no upcoming shifts
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *You are not currently on call*\nNo upcoming shifts scheduled.`
      }
    });
  }
  
  return blocks;
}

/**
 * Build user's upcoming shifts section
 * @param {Array} upcomingShifts - Array of shift objects from getUserUpcomingShifts
 * @param {string} userId - Slack user ID
 * @returns {Array<Object>} Array of Block Kit blocks
 */
function buildUserUpcomingShiftsBlocks(upcomingShifts, userId) {
  if (!upcomingShifts || upcomingShifts.length === 0) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '_No upcoming shifts scheduled._' }
      }
    ];
  }
  
  const blocks = [
    buildHeaderBlock('Your Upcoming Shifts')
  ];
  
  upcomingShifts.forEach(shift => {
    const startFormatted = dayjs(`${shift.startDate}T00:00:00-07:00`).format("MMM D");
    const endFormatted = dayjs(`${shift.endDate}T00:00:00-07:00`).format("MMM D");
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${shift.sprintName}*\n${ROLE_ICONS[shift.role] || ''} ${shift.roleDisplay} • ${startFormatted} - ${endFormatted} • ${shift.daysUntil}`
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Request Coverage', emoji: true },
        action_id: 'request_coverage_from_home',
        value: JSON.stringify({ userId, sprintIndex: shift.sprintIndex })
      }
    });
  });
  
  return blocks;
}

/**
 * Build quick actions block
 * @param {string} userId - Slack user ID
 * @param {boolean} hasUpcomingShifts - Whether user has upcoming shifts
 * @param {boolean} isOnCall - Whether user is currently on call
 * @returns {Object} Actions block with quick action buttons
 */
function buildQuickActionsBlock(userId, hasUpcomingShifts, isOnCall) {
  const elements = [];
  
  if (isOnCall || hasUpcomingShifts) {
    elements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Request Coverage', emoji: true },
      style: 'primary',
      action_id: 'request_coverage_from_home',
      value: JSON.stringify({ userId })
    });
  }
  
  elements.push({
    type: 'button',
    text: { type: 'plain_text', text: 'View My Schedule', emoji: true },
    action_id: 'view_my_schedule',
    value: JSON.stringify({ userId })
  });
  
  elements.push({
    type: 'button',
    text: { type: 'plain_text', text: 'View All Sprints', emoji: true },
    action_id: 'open_upcoming_sprints'
  });
  
  return {
    type: 'actions',
    elements
  };
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
          text: `Warning: ${message}\n\nIf this issue persists, please contact your administrator.`
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
// NOTE: Duplicate buildDisciplineBlocks function removed - using the one at line 1157

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
/**
 * Build the enhanced App Home view with personalization and improved layout
 * @param {Object|null} current - Current rotation data
 * @param {Object|null} next - Next rotation data
 * @param {Object|null} disciplines - Discipline object
 * @param {string|null} userId - Slack user ID for personalization
 * @param {Object|null} onCallStatus - User's on-call status
 * @param {Array} upcomingShifts - User's upcoming shifts
 * @returns {Object} Slack Block Kit home view object
 */
async function buildHomeView(current, next, disciplines, userId = null, onCallStatus = null, upcomingShifts = []) {
  // Build personal status card (hero section)
  const personalStatusBlocks = userId ? buildPersonalStatusCard(userId, onCallStatus, upcomingShifts[0] || null) : [];
  
  // Build current rotation blocks (highlight user if on call)
  const highlightUserId = onCallStatus ? userId : null;
  const currentBlocks = buildCurrentRotationBlocks(current, highlightUserId);
  
  // Build next rotation blocks (highlight user if they're in next sprint)
  let nextHighlightUserId = null;
  if (userId && next) {
    const userInNext = next.users.find(u => u.slackId === userId);
    if (userInNext) {
      nextHighlightUserId = userId;
    }
  }
  const nextBlocks = buildNextRotationBlocks(next, nextHighlightUserId);
  
  // Build user's upcoming shifts section
  const upcomingShiftsBlocks = userId && upcomingShifts.length > 0 
    ? buildUserUpcomingShiftsBlocks(upcomingShifts, userId)
    : [];
  
  // Build quick actions
  const quickActionsBlock = userId 
    ? buildQuickActionsBlock(userId, upcomingShifts.length > 0, !!onCallStatus)
    : {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'View All Sprints', emoji: true },
          action_id: 'open_upcoming_sprints'
        }]
      };
  
  // Add button to view discipline lists (if disciplines available)
  if (disciplines && Object.keys(disciplines).length > 0) {
    const quickActionsElements = quickActionsBlock.elements || [];
    quickActionsElements.push({
      type: 'button',
      text: { type: 'plain_text', text: 'View Rotation Lists', emoji: true },
      action_id: 'view_discipline_lists'
    });
    quickActionsBlock.elements = quickActionsElements;
  }

  const blocks = [];
  
  // Hero section: Personal status (show first if user is on call or has next shift)
  if (personalStatusBlocks.length > 0) {
    blocks.push(...personalStatusBlocks);
    blocks.push({ type: 'divider' });
  }
  
  // Current on-call section - ALWAYS show if there's an active sprint
  // This shows the full team that's currently on call together
  if (current && current.users && current.users.length > 0) {
    blocks.push(...currentBlocks);
    blocks.push({ type: 'divider' });
  }
  
  // Next sprint section - show next sprint team
  if (next && next.users && next.users.length > 0) {
    blocks.push(...nextBlocks);
    blocks.push({ type: 'divider' });
  }
  
  // User's upcoming shifts (if any) - personal schedule
  if (upcomingShiftsBlocks.length > 0) {
    blocks.push(...upcomingShiftsBlocks);
    blocks.push({ type: 'divider' });
  }
  
  // Quick actions
  blocks.push(quickActionsBlock);

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
  
  // Use section block instead of header for modal compatibility (headers may not work in all modal contexts)
  // Header block for section title - REMOVED: Headers may cause issues in modals opened from app home
  // blocks.push(buildHeaderBlock('Discipline Rotation Lists'));
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Discipline Rotation Lists*'
    }
  });
  blocks.push({ type: 'divider' });
  
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
    const fullText = `*${displayRole}*\n${userList}`;
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: fullText
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

// Determine receiver mode based on environment.
// - Socket Mode is for local/dev when SLACK_APP_TOKEN is set (and SOCKET_MODE is not 'false')
// - HTTP Mode is for production (or when SOCKET_MODE=false / no SLACK_APP_TOKEN)
const isDev = process.env.NODE_ENV !== 'production';
const socketModeRequested = process.env.SOCKET_MODE !== 'false';
const hasAppToken = !!process.env.SLACK_APP_TOKEN;
const useSocketMode = isDev && socketModeRequested && hasAppToken;

let receiver = null;
const receiverMode = useSocketMode ? 'socket' : 'http';

if (useSocketMode) {
  console.log('[appHome] Using Socket Mode (SLACK_APP_TOKEN present)');
} else {
  receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/slack/events'
  });
  console.log('[appHome] Using HTTP mode (ExpressReceiver)');
}

const slackApp = useSocketMode
  ? new App({
      token: process.env.SLACK_BOT_TOKEN,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN
    })
  : new App({
      token: process.env.SLACK_BOT_TOKEN,
      receiver
    });

// #region agent log
fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:slackApp_init',message:'Slack app initialized (token type hints)',data:{botTokenPrefix:process.env.SLACK_BOT_TOKEN?String(process.env.SLACK_BOT_TOKEN).slice(0,4):null,botTokenLen:process.env.SLACK_BOT_TOKEN?String(process.env.SLACK_BOT_TOKEN).length:0,appTokenPrefix:process.env.SLACK_APP_TOKEN?String(process.env.SLACK_APP_TOKEN).slice(0,4):null,appTokenLen:process.env.SLACK_APP_TOKEN?String(process.env.SLACK_APP_TOKEN).length:0,socketMode:useSocketMode,receiverMode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
// #endregion

/**
 * Action handler: Open Upcoming Sprints Modal.
 */
slackApp.action('open_upcoming_sprints', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    // Get trigger_id - check multiple possible locations
    const triggerId = body.trigger_id;

    const minimalView = {
      type: "modal",
      callback_id: "override_minimal_probe",
      title: { type: "plain_text", text: "Request Coverage" },
      close: { type: "plain_text", text: "Close" },
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Opening coverage request..." }
        }
      ]
    };
    
    if (!triggerId) {
      logger.error("No trigger_id found in open_upcoming_sprints action - cannot open modal");
      // Try to send DM as fallback
      const userId = body.user?.id;
      if (userId) {
        try {
          await client.chat.postMessage({
            channel: userId,
            text: "Unable to open upcoming sprints modal. Please try again later or contact your administrator."
          });
        } catch (dmError) {
          logger.error("Error sending fallback DM:", dmError);
        }
      }
      return;
    }
    
    const modalView = await buildUpcomingSprintsModal();
    
    await client.views.open({
      trigger_id: triggerId,
      view: modalView
    });
  } catch (error) {
    logger.error("Error opening upcoming sprints modal:", error, {
      errorMessage: error.message,
      errorStack: error.stack,
      hasTriggerId: !!body?.trigger_id
    });
    // Try to send fallback message
    try {
      const userId = body.user?.id;
      if (userId) {
        await client.chat.postMessage({
          channel: userId,
          text: "Unable to open upcoming sprints modal. Please try again later."
        });
      }
    } catch (fallbackError) {
      logger.error("Error sending fallback message:", fallbackError);
    }
  }
});

/**
 * Action handler: Request Coverage from Home
 */
slackApp.action('request_coverage_from_home', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const interactivityPointer =
      body?.interactivity?.interactivity_pointer ||
      body?.interactivity_pointer ||
      null;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:entry',message:'Request coverage action received',data:{hasTriggerId:!!body?.trigger_id,triggerIdPrefix:body?.trigger_id?String(body.trigger_id).slice(0,18):null,triggerIdLen:body?.trigger_id?String(body.trigger_id).length:0,bodyType:body?.type||null,containerType:body?.container?.type||null,viewId:body?.view?.id||null,actionId:body?.actions?.[0]?.action_id||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:interactivity_pointer',message:'Interactivity pointer presence',data:{hasInteractivityPointer:!!interactivityPointer,interactivityPointerPrefix:interactivityPointer?String(interactivityPointer).slice(0,10):null,interactivityPointerLen:interactivityPointer?String(interactivityPointer).length:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'P1'})}).catch(()=>{});
    // #endregion

    // Get user ID - handle both app home and modal contexts
    let userId = body.user?.id;
    let sprintIndex = null;
    
    // Try to parse action value if it exists
    if (body.actions && body.actions[0] && body.actions[0].value) {
      try {
        const actionValue = JSON.parse(body.actions[0].value);
        userId = actionValue.userId || userId;
        sprintIndex = actionValue.sprintIndex || null;
      } catch (parseError) {
        logger.warn("Could not parse action value:", parseError);
      }
    }
    
    if (!userId) {
      logger.error("No user ID found in request coverage action");
      return;
    }
    
    // Check if trigger_id exists (required for opening modals)
    if (!body.trigger_id && !interactivityPointer) {
      logger.error("No trigger_id found in request coverage action - cannot open modal");
      // Send ephemeral message instead
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: userId,
        text: `Please use ${getEnvironmentCommand('triage-override')} command to request coverage.`
      });
      return;
    }
    
    // Import override modal builder
    const { buildOverrideRequestModal } = require('./overrideModal');
    const modalView = buildOverrideRequestModal(userId);

    // #region agent log
    const blocks = Array.isArray(modalView?.blocks) ? modalView.blocks : [];
    const sprintBlock = blocks.find(b => b && b.block_id === 'sprint_selection');
    const sprintOptionsCount = sprintBlock?.element?.options?.length ?? -1;
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:modal_built',message:'Modal built for request coverage',data:{userId,modalCallbackId:modalView?.callback_id||null,blockCount:blocks.length,blockTypes:blocks.map(b=>b?.type).filter(Boolean).slice(0,20),sprintOptionsCount,modalSize:JSON.stringify(modalView).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    const fs = require('fs');
    const errorLogPath = '/Users/natlubec/_po/t1-triage-bot/.cursor/error.log';
    console.error('[DEBUG appHome] ===== ABOUT TO OPEN MODAL =====');
    console.error('[DEBUG appHome] Action:', 'request_coverage_from_home');
    console.error('[DEBUG appHome] User ID:', userId);
    console.error('[DEBUG appHome] Trigger ID:', body.trigger_id?.substring(0,30)+'...');
    console.error('[DEBUG appHome] Modal size:', JSON.stringify(modalView).length);
    try {
      fs.writeFileSync(errorLogPath, JSON.stringify({type:'appHome_modal_open',userId:userId,triggerId:body.trigger_id,modalView:modalView,timestamp:new Date().toISOString()}, null, 2));
    } catch(e) {
      console.error('[DEBUG appHome] Failed to write error log:', e.message);
    }
    // #endregion
    
    const triggerId = body.trigger_id;

    const minimalView = {
      type: "modal",
      callback_id: "override_minimal_probe",
      title: { type: "plain_text", text: "Request Coverage" },
      close: { type: "plain_text", text: "Close" },
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Opening coverage request..." }
        }
      ]
    };

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:before_views_open',message:'About to call views.open',data:{triggerIdPrefix:triggerId?String(triggerId).slice(0,18):null,modalCallbackId:modalView?.callback_id||null,modalSize:JSON.stringify(modalView).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:context_ids',message:'Slack interaction context ids',data:{apiAppId:body?.api_app_id||null,teamId:body?.team?.id||body?.user?.team_id||null,enterpriseId:body?.enterprise?.id||null,isEnterpriseInstall:body?.is_enterprise_install||null,userId:body?.user?.id||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    // Probe auth context (helps detect token/app/workspace mismatch).
    try {
      const auth = await client.auth.test();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:auth_test',message:'client.auth.test result',data:{ok:auth?.ok??true,teamId:auth?.team_id||null,enterpriseId:auth?.enterprise_id||null,userId:auth?.user_id||null,botId:auth?.bot_id||null,url:auth?.url||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
    } catch (authErr) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:auth_test_failed',message:'client.auth.test failed',data:{errorMessage:authErr?.message||null,code:authErr?.code||null,slackError:authErr?.data?.error||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
    }

    const tryOpen = async (viewToOpen, attemptLabel) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:views_open_attempt',message:'views.open attempt',data:{attempt:attemptLabel,viewCallbackId:viewToOpen?.callback_id||null,viewSize:JSON.stringify(viewToOpen).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      const args = interactivityPointer
        ? { interactivity_pointer: interactivityPointer, view: viewToOpen }
        : { trigger_id: triggerId, view: viewToOpen };
      return await client.views.open(args);
    };

    // Open a minimal probe modal first, then update to the real view.
    // This helps distinguish trigger-id issues from view-shape issues and can improve reliability.
    let openResult;
    try {
      openResult = await tryOpen(minimalView, 'probe_first');
    } catch (openErr) {
      const slackErr = openErr?.data?.error || null;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:probe_first_failed',message:'probe-first views.open failed',data:{slackError:slackErr,errorMessage:openErr?.message||null,code:openErr?.code||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      throw openErr;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:probe_first_ok',message:'probe-first views.open succeeded',data:{openedViewId:openResult?.view?.id||null,openedHash:openResult?.view?.hash||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion

    try {
      await client.views.update({
        view_id: openResult.view.id,
        hash: openResult.view.hash,
        view: modalView
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:update_ok',message:'views.update to real modal succeeded',data:{viewId:openResult?.view?.id||null,modalCallbackId:modalView?.callback_id||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
    } catch (updateErr) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:update_failed',message:'views.update to real modal failed',data:{slackError:updateErr?.data?.error||null,errorMessage:updateErr?.message||null,code:updateErr?.code||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      throw updateErr;
    }
  } catch (error) {
    // #region agent log
    const useSocketMode = !!process.env.SLACK_APP_TOKEN || process.env.SOCKET_MODE === 'true';
    console.error('[DEBUG appHome] ===== ERROR DETAILS =====');
    console.error('[DEBUG appHome] Socket Mode:', useSocketMode);
    console.error('[DEBUG appHome] Error message:', error.message);
    console.error('[DEBUG appHome] Error code:', error.code);
    console.error('[DEBUG appHome] Error data:', JSON.stringify(error.data, null, 2));
    console.error('[DEBUG appHome] Error response_metadata:', JSON.stringify(error.data?.response_metadata, null, 2));
    console.error('[DEBUG appHome] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('[DEBUG appHome] =========================');
    // #endregion

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'appHome.js:request_coverage_from_home:error',message:'views.open failed for request coverage modal',data:{errorMessage:error?.message||null,errorCode:error?.code||null,slackError:error?.data?.error||null,slackMessages:error?.data?.response_metadata?.messages||null,status:error?.data?.response_metadata?.status||null,hasTriggerId:!!body?.trigger_id,triggerIdPrefix:body?.trigger_id?String(body.trigger_id).slice(0,18):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    logger.error("Error opening coverage request modal from home:", error);
    // Try to send ephemeral message as fallback
    try {
      if (body.user?.id) {
        await client.chat.postEphemeral({
          channel: body.user.id,
          user: body.user.id,
          text: `Unable to open coverage request. Please try ${getEnvironmentCommand('triage-override')} command instead.`
        });
      }
    } catch (fallbackError) {
      logger.error("Error sending fallback message:", fallbackError);
    }
  }
});

/**
 * Action handler: View My Schedule
 */
slackApp.action('view_my_schedule', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    // Get user ID - handle both app home and modal contexts
    let userId = body.user?.id;
    
    // Try to parse action value if it exists
    if (body.actions && body.actions[0] && body.actions[0].value) {
      try {
        const actionValue = JSON.parse(body.actions[0].value);
        userId = actionValue.userId || userId;
      } catch (parseError) {
        logger.warn("Could not parse action value:", parseError);
      }
    }
    
    if (!userId) {
      logger.error("No user ID found in view my schedule action");
      return;
    }
    
    // Check if trigger_id exists (required for opening modals)
    if (!body.trigger_id) {
      logger.error("No trigger_id found in view my schedule action - cannot open modal");
      // Send ephemeral message instead
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: userId,
        text: `Please use ${getEnvironmentCommand('triage-override')} command to view your schedule.`
      });
      return;
    }
    
    // Get user's upcoming shifts
    const sprints = await readSprints();
    const disciplines = await readDisciplines();
    const upcomingShifts = await getUserUpcomingShifts(userId, sprints, disciplines);
    
    // Build modal with user's schedule
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Your Schedule' }
      },
      { type: 'divider' }
    ];
    
    if (upcomingShifts.length === 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '_No upcoming shifts scheduled._' }
      });
    } else {
      // Limit to prevent modal size issues (Slack has max 100 blocks)
      const shiftsToShow = upcomingShifts.slice(0, 10);
      shiftsToShow.forEach(shift => {
        const startFormatted = dayjs(`${shift.startDate}T00:00:00-07:00`).format("ddd, MMM D, YYYY");
        const endFormatted = dayjs(`${shift.endDate}T00:00:00-07:00`).format("ddd, MMM D, YYYY");
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${shift.sprintName}*\n${ROLE_ICONS[shift.role] || ''} ${shift.roleDisplay}\n📅 ${startFormatted} - ${endFormatted}\n⏰ ${shift.daysUntil}`
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Request Coverage', emoji: true },
            action_id: 'request_coverage_from_home',
            value: JSON.stringify({ userId, sprintIndex: shift.sprintIndex })
          }
        });
        blocks.push({ type: 'divider' });
      });
      
      // Remove last divider
      if (blocks[blocks.length - 1].type === 'divider') {
        blocks.pop();
      }
      
      if (upcomingShifts.length > shiftsToShow.length) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `_Showing ${shiftsToShow.length} of ${upcomingShifts.length} shifts_`
          }]
        });
      }
    }
    
    // Validate block count (Slack modal limit is 100 blocks)
    if (blocks.length > 100) {
      logger.warn(`Modal block count (${blocks.length}) exceeds Slack limit of 100 blocks`);
      blocks.splice(100);
    }
    
    const modalView = {
      type: 'modal',
      callback_id: 'my_schedule_modal',
      title: { type: 'plain_text', text: 'My Schedule' },
      close: { type: 'plain_text', text: 'Close' },
      blocks
    };
    
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modalView
    });
  } catch (error) {
    logger.error("Error opening my schedule modal:", error);
    // Try to send ephemeral message as fallback
    try {
      if (body.user?.id) {
        await client.chat.postEphemeral({
          channel: body.user.id,
          user: body.user.id,
          text: "Unable to open schedule view. Please try again later."
        });
      }
    } catch (fallbackError) {
      logger.error("Error sending fallback message:", fallbackError);
    }
  }
});

/**
 * Action handler: View Discipline Lists
 */
slackApp.action('view_discipline_lists', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    // Get user ID
    const userId = body.user?.id;
    if (!userId) {
      logger.error("No user ID found in view discipline lists action");
      return;
    }
    
    // Get trigger_id - check multiple possible locations
    let triggerId = body.trigger_id;
    if (!triggerId && body.container) {
      // For app home actions, trigger_id might be in a different location
      // Try to get it from the view if available
      logger.warn("No trigger_id found in body, checking container:", body.container);
    }
    
    if (!triggerId) {
      logger.error("No trigger_id found in view discipline lists action - cannot open modal");
      // Send DM instead since we can't open modal without trigger_id
      try {
        await client.chat.postMessage({
          channel: userId,
          text: "Here are the rotation lists:\n\n" + await formatDisciplinesAsText()
        });
      } catch (dmError) {
        logger.error("Error sending DM with discipline lists:", dmError);
      }
      return;
    }
    
    const disciplines = await readDisciplines();
    const disciplineBlocks = buildDisciplineBlocks(disciplines);
    
    // Validate block count (Slack modal limit is 100 blocks)
    // Also ensure blocks are valid
    if (disciplineBlocks.length > 100) {
      logger.warn(`Discipline blocks count (${disciplineBlocks.length}) exceeds Slack limit of 100 blocks, truncating`);
      // Keep header and truncate the rest
      const headerIndex = disciplineBlocks.findIndex(b => b.type === 'header');
      if (headerIndex >= 0) {
        const truncatedBlocks = [
          disciplineBlocks[headerIndex],
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `_Too many disciplines to display (${disciplineBlocks.length} blocks). Showing first 5 disciplines only._`
            }
          },
          { type: 'divider' }
        ];
        // Add first few discipline blocks (max 95 to stay under limit)
        const maxBlocksToAdd = 95;
        let blocksAdded = 0;
        for (let i = headerIndex + 1; i < disciplineBlocks.length && blocksAdded < maxBlocksToAdd; i++) {
          truncatedBlocks.push(disciplineBlocks[i]);
          blocksAdded++;
        }
        disciplineBlocks.splice(0, disciplineBlocks.length, ...truncatedBlocks);
      } else {
        disciplineBlocks.splice(100);
      }
    }
    
    // Validate all blocks have required fields
    const validBlocks = disciplineBlocks.filter(block => {
      if (!block.type) return false;
      if (block.type === 'section' && !block.text && !block.fields) return false;
      if (block.type === 'header' && !block.text) return false;
      return true;
    });
    
    const modalView = {
      type: 'modal',
      callback_id: 'discipline_lists_modal',
      title: { type: 'plain_text', text: 'Rotation Lists' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: validBlocks
    };
    
    try {
      const result = await client.views.open({
        trigger_id: triggerId,
        view: modalView
      });
    } catch (openError) {
      throw openError;
    }
  } catch (error) {
    logger.error("Error opening discipline lists modal:", error, {
      errorMessage: error.message,
      errorStack: error.stack,
      bodyKeys: body ? Object.keys(body) : null,
      hasTriggerId: !!body?.trigger_id
    });
    // Try to send ephemeral message or DM as fallback
    try {
      const userId = body.user?.id;
      if (userId) {
        // Try DM since ephemeral requires channel
        await client.chat.postMessage({
          channel: userId,
          text: `Unable to open rotation lists modal. Please try ${getEnvironmentCommand('triage-override')} command or contact your administrator.`
        });
      }
    } catch (fallbackError) {
      logger.error("Error sending fallback message:", fallbackError);
    }
  }
});

/**
 * Helper function to format disciplines as plain text for fallback
 */
async function formatDisciplinesAsText() {
  try {
    const disciplines = await readDisciplines();
    if (!disciplines || Object.keys(disciplines).length === 0) {
      return "No discipline data available.";
    }
    
    let text = "";
    const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
    
    roleOrder.forEach(role => {
      if (!disciplines[role] || !Array.isArray(disciplines[role]) || disciplines[role].length === 0) {
        return;
      }
      
      const displayRole = ROLE_DISPLAY[role] || role;
      text += `*${displayRole}:*\n`;
      disciplines[role].forEach(u => {
        text += `  • ${u.name} (<@${u.slackId}>)\n`;
      });
      text += "\n";
    });
    
    return text || "No disciplines configured.";
  } catch (error) {
    console.error("Error formatting disciplines as text:", error);
    return "Error loading discipline data.";
  }
}

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
    
    // Get user-specific information for personalization
    const userId = event.user;
    let onCallStatus = null;
    let upcomingShifts = [];
    
    if (userId) {
      // Calculate user's on-call status
      onCallStatus = getUserOnCallStatus(userId, current);
      
      // Get user's upcoming shifts
      try {
        const sprints = await readSprints();
        upcomingShifts = await getUserUpcomingShifts(userId, sprints, disciplines);
      } catch (error) {
        logger.error('[app_home_opened] Error loading user upcoming shifts:', error);
      }
    }
    
    // Build and publish home view with available data
    // buildHomeView handles null values gracefully
    const homeView = await buildHomeView(current, next, disciplines, userId, onCallStatus, upcomingShifts);
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

// Export the Slack Bolt app, its receiver, and receiver mode for integration with server.js
// Also export view building functions for testing
module.exports = { 
  slackApp, 
  receiver,
  receiverMode,
  buildHomeView,
  buildFallbackView,
  getCurrentOnCall,
  getNextOnCall
};