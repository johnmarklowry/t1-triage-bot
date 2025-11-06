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
} = require('../services/dataUtils');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Get upcoming sprints from today onward.
 */
function getUpcomingSprints() {
  const allSprints = readSprints();
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
function getOnCallForSprint(sprintIndex, role, disciplines) {
  const users = getSprintUsers(sprintIndex);
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
 */
function getCurrentOnCall() {
  // First, refresh the current state to ensure it matches calculations
  refreshCurrentState();
  
  const currentState = readCurrentState();
  const sprints = readSprints();
  const disciplines = readDisciplines();

  if (currentState.sprintIndex === null || sprints.length === 0) {
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
}

/**
 * Get the next on-call rotation.
 * Uses the centralized getSprintUsers for consistency
 */
function getNextOnCall() {
  const currentState = readCurrentState();
  const sprints = readSprints();
  const disciplines = readDisciplines();

  if (currentState.sprintIndex === null) {
    return null;
  }
  
  const nextIndex = currentState.sprintIndex + 1;
  if (nextIndex >= sprints.length) {
    return null;
  }
  
  const nextSprint = sprints[nextIndex];
  
  // Use centralized function to get users for the next sprint
  const sprintUsers = getSprintUsers(nextIndex);
  
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
 * Build the App Home view using Block Kit.
 */
function buildHomeView(current, next, disciplines) {
  const currentText = formatCurrentText(current);
  const nextText = formatNextText(next);
  const disciplineText = formatDisciplines(disciplines);

  return {
    type: 'home',
    callback_id: 'triage_app_home',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Welcome to the Triage Rotation App Home!*' }
      },
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
      {
        type: 'section',
        text: { type: 'mrkdwn', text: currentText }
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: nextText }
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: disciplineText }
      }
    ]
  };
}

/**
 * Format the Current On-Call Rotation section.
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
 * Format the Next On-Call Rotation section.
 */
function formatNextText(nxt) {
  if (!nxt) return '_No next sprint found._';
  
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
 * Format the Discipline Rotation Lists.
 * Displays each discipline as a header, then an indented list of names.
 */
function formatDisciplines(discObj) {
  if (!discObj) return '_No discipline data available._';
  let text = '*Discipline Rotation Lists*\n';
  
  const roleOrder = ['account', 'producer', 'po', 'uiEng', 'beEng'];
  
  roleOrder.forEach(role => {
    if (!discObj[role]) return;
    
    const displayRole = ROLE_DISPLAY[role] || role;
    text += `\n*${displayRole}*\n`;
    discObj[role].forEach(u => {
      text += `    ${u.name} (<@${u.slackId}>)\n`;
    });
  });
  
  return text;
}

/**
 * buildUpcomingSprintsModal:
 * Builds a modal view that lists upcoming sprints with their on-call rotations
 */
function buildUpcomingSprintsModal() {
  // Load data from JSON files
  const currentState = readCurrentState();
  const allSprints = readSprints();
  const disciplines = readDisciplines();

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
  upcomingSprints.forEach((sprint, i) => {
    const actualIndex = startingIndex + i;
    // Format dates properly by adding T00:00:00 to ensure they're interpreted as midnight PT
    const startFormatted = dayjs(`${sprint.startDate}T00:00:00-07:00`).format('ddd MM/DD/YYYY');
    const endFormatted = dayjs(`${sprint.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
    
    let rotationText = "";
    ["account", "producer", "po", "uiEng", "beEng"].forEach(role => {
      const user = getOnCallForSprint(actualIndex, role, disciplines);
      const displayRole = ROLE_DISPLAY[role] || role;
      if (user) {
        rotationText += `*${displayRole}*: ${user.name} (<@${user.slackId}>)\n`;
      } else {
        rotationText += `*${displayRole}*: _Unassigned_\n`;
      }
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${sprint.sprintName}*\nDates: ${startFormatted} to ${endFormatted}\n${rotationText}`
      }
    });
    blocks.push({ type: "divider" });
  });

  return {
    type: "modal",
    callback_id: "upcoming_sprints_modal",
    title: { type: "plain_text", text: "Upcoming Sprints" },
    submit: { type: "plain_text", text: "Close" },
    close: { type: "plain_text", text: "Cancel" },
    blocks
  };
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
    const modalView = buildUpcomingSprintsModal();
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
 */
slackApp.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    const current = getCurrentOnCall();
    const next = getNextOnCall();
    const disciplines = readDisciplines();
    const homeView = buildHomeView(current, next, disciplines);
    await client.views.publish({
      user_id: event.user,
      view: homeView
    });
  } catch (error) {
    logger.error('Error publishing App Home view:', error);
  }
});

// Export the Slack Bolt app and its receiver for integration with server.js
module.exports = { slackApp, receiver };