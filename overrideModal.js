// overrideModal.js
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const DISCIPLINES_FILE = path.join(__dirname, 'disciplines.json');
const SPRINTS_FILE = path.join(__dirname, 'sprints.json');

/**
 * Helper to load a JSON file.
 */
function loadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
    return null;
  }
}

/**
 * Load disciplines from disciplines.json.
 */
function getDisciplines() {
  return loadJSON(DISCIPLINES_FILE) || {};
}

/**
 * Load all sprints from sprints.json.
 */
function getAllSprints() {
  return loadJSON(SPRINTS_FILE) || [];
}

/**
 * getUserRole: Determine the role for a given user by scanning disciplines.json.
 */
function getUserRole(userId) {
  const disciplines = getDisciplines();
  for (const role in disciplines) {
    const list = disciplines[role];
    if (Array.isArray(list)) {
      for (const userObj of list) {
        if (userObj.slackId === userId) {
          return role;
        }
      }
    }
  }
  return null;
}

/**
 * buildUserSprintOptions:
 * For the given requester (by Slack ID), build radio button options for each sprint
 * in which the requester is scheduled for the role.
 * Uses default rotation logic: assigned user = roleList[sprintIndex % roleList.length].
 */
function buildUserSprintOptions(requesterSlackId) {
  const role = getUserRole(requesterSlackId);
  if (!role) {
    console.error(`Requester role not found for ${requesterSlackId}`);
    return [];
  }
  const allSprints = getAllSprints();
  const disciplines = getDisciplines();
  const roleList = disciplines[role] || [];
  const options = [];
  
  // For each sprint, check if the rotation assigns the requester.
  allSprints.forEach((sprint, index) => {
    if (roleList.length > 0) {
      const assigned = roleList[index % roleList.length];
      if (assigned && assigned.slackId === requesterSlackId) {
        const startFormatted = dayjs(sprint.startDate)
          .tz("America/Los_Angeles")
          .format("MM/DD/YYYY");
        const endFormatted = dayjs(sprint.endDate)
          .tz("America/Los_Angeles")
          .format("MM/DD/YYYY");
        options.push({
          text: { type: "plain_text", text: `${sprint.sprintName} (${startFormatted} - ${endFormatted})` },
          value: index.toString()
        });
      }
    }
  });
  
  // If no options found, supply a fallback option.
  if (options.length === 0) {
    options.push({
      text: { type: "plain_text", text: "No scheduled sprints found" },
      value: "none"
    });
  }
  return options;
}

/**
 * Given a role and the requester's Slack ID, build static select options
 * containing all other users in that role.
 */
function buildReplacementOptions(role, requesterSlackId) {
  const disciplines = getDisciplines();
  const roleList = disciplines[role] || [];
  const options = roleList
    .filter(user => user.slackId !== requesterSlackId)
    .map(user => ({
      text: { type: "plain_text", text: user.name },
      value: user.slackId
    }));
  // If no replacement options exist, add a fallback option.
  if (options.length === 0) {
    options.push({
      text: { type: "plain_text", text: "No users found" },
      value: "none"
    });
  }
  return options;
}

/**
 * buildOverrideRequestModal:
 * Builds the modal view for an override request.
 * The modal will show:
 *  - A radio button list of sprints (with sprint names and dates) that the requester is scheduled for.
 *  - A static select for replacement from other users in the same role.
 * 
 * @param {string} requesterSlackId - The Slack ID of the requester.
 */
function buildOverrideRequestModal(requesterSlackId) {
  const role = getUserRole(requesterSlackId);
  // Store role and requester in private_metadata.
  const privateMetadata = JSON.stringify({ role, requester: requesterSlackId });
  return {
    type: "modal",
    callback_id: "override_request_modal",
    private_metadata: privateMetadata,
    title: { type: "plain_text", text: "Request Coverage" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "sprint_selection",
        element: {
          type: "radio_buttons",
          action_id: "sprint_select",
          options: buildUserSprintOptions(requesterSlackId)
        },
        label: { type: "plain_text", text: "Which sprint do you need coverage for?" }
      },
      {
        type: "input",
        block_id: "replacement",
        element: {
          type: "static_select",
          action_id: "replacement_select",
          placeholder: { type: "plain_text", text: "Select a replacement" },
          options: buildReplacementOptions(role, requesterSlackId)
        },
        label: { type: "plain_text", text: "Who should cover this sprint?" }
      },
      {
        type: "context",
        block_id: "note",
        elements: [
          {
            type: "mrkdwn",
            text: "If the person providing your coverage isn't listed here, please contact an admin to add that user to the role for the #lcom-bug-triage on call rotation."
          }
        ]
      }
    ]
  };
}

module.exports = { buildOverrideRequestModal };
