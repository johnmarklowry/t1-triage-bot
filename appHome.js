/********************************
 * appHome.js
 ********************************/
require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
``
// Import centralized data utilities
const {
  readCurrentState,
  readSprints,
  readDisciplines,
  loadJSON,
  getSprintUsers,
  OVERRIDES_FILE
} = require('./dataUtils');

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
 */
function getOnCallForSprint(sprintIndex, role, disciplines) {
  // Load overrides from overrides.json
  let overrides = [];
  try {
    const data = loadJSON(OVERRIDES_FILE);
    overrides = data || [];
  } catch (err) {
    console.error("Error loading overrides:", err);
  }
  
  // Check for an approved override for this sprint and role.
  const override = overrides.find(o =>
    o.sprintIndex === sprintIndex &&
    o.role === role &&
    o.approved === true
  );
  if (override) {
    // Look up the replacement's details from disciplines.json.
    const roleArray = disciplines[role] || [];
    const replacement = roleArray.find(u => u.slackId === override.newSlackId);
    if (replacement) {
      return replacement; // returns an object { name, slackId }
    } else {
      // Fallback: return an object with the override's Slack ID.
      return { slackId: override.newSlackId, name: override.newSlackId };
    }
  }
  
  // No override found; use default rotation logic.
  const roleArray = disciplines[role] || [];
  if (roleArray.length === 0) return null;
  const idx = sprintIndex % roleArray.length;
  return roleArray[idx];
}

/**
 * Get the current on-call rotation.
 * Reads currentState.json and sprints.json, then enriches stored Slack IDs with names from disciplines.json.
 */
function getCurrentOnCall() {
  const currentState = readCurrentState();
  const sprints = readSprints();
  const disciplines = readDisciplines();

  if (currentState.sprintIndex === null || sprints.length === 0) {
    return null;
  }
  const curSprint = sprints[currentState.sprintIndex];
  let users = [];
  for (let role of ["account", "producer", "po", "uiEng", "beEng"]) {
    const roleArray = disciplines[role] || [];
    // Find user object matching stored Slack ID
    const userObj = roleArray.find(u => u.slackId === currentState[role]);
    if (userObj) {
      users.push({ role, name: userObj.name, slackId: userObj.slackId });
    } else if (currentState[role]) {
      // Fallback: use the stored Slack ID as both name and slackId.
      users.push({ role, name: currentState[role], slackId: currentState[role] });
    }
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
 * Uses the next sprint index and computes on-call for each discipline.
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
  let users = [];
  for (let role of ["account", "producer", "po", "uiEng", "beEng"]) {
    const roleArray = disciplines[role] || [];
    if (roleArray.length === 0) continue;
    const idx = nextIndex % roleArray.length;
    const userObj = roleArray[idx];
    users.push({ role, name: userObj.name, slackId: userObj.slackId });
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
  cur.users.forEach(u => {
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
  nxt.users.forEach(u => {
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
  Object.keys(discObj).forEach(role => {
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
 * Builds a modal view that lists upcoming sprints with their on-call rotations,
 * starting from the current sprint index (from currentState.json) to the end of sprints.json.
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

  // Define display labels for roles
  const ROLE_DISPLAY_LOCAL = {
    account: "Account",
    producer: "Producer",
    po: "PO",
    uiEng: "UI Engineer",
    beEng: "BE Engineer"
  };

  // For each upcoming sprint, compute the actual sprint index in the full sprints array.
  upcomingSprints.forEach((sprint, i) => {
  const actualIndex = startingIndex + i;
  // Format dates properly by adding T00:00:00 to ensure they're interpreted as midnight PT
  const startFormatted = dayjs(`${sprint.startDate}T00:00:00-07:00`).format('ddd MM/DD/YYYY');
  const endFormatted = dayjs(`${sprint.endDate}T00:00:00-07:00`).format("ddd MM/DD/YYYY");
  
  let rotationText = "";
  ["account", "producer", "po", "uiEng", "beEng"].forEach(role => {
    const user = getOnCallForSprint(actualIndex, role, disciplines);
    const displayRole = ROLE_DISPLAY_LOCAL[role] || role;
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