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
 * For the given requester (by Slack ID), build select options for each sprint
 * in which the requester is scheduled for the role.
 * Uses default rotation logic: assigned user = roleList[sprintIndex % roleList.length].
 */
function buildUserSprintOptions(requesterSlackId) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:65',message:'buildUserSprintOptions entry',data:{requesterSlackId:requesterSlackId,timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  const role = getUserRole(requesterSlackId);
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:67',message:'Role retrieved in buildUserSprintOptions',data:{requesterSlackId:requesterSlackId,role:role,roleIsNull:role===null,timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  if (!role) {
    console.error(`Requester role not found for ${requesterSlackId}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:69',message:'Role is null - returning empty array',data:{requesterSlackId:requesterSlackId,timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
    // #endregion
    // Return a fallback option so any caller that renders a select remains valid.
    return [
      {
        text: { type: "plain_text", text: "No role found for your user" },
        value: "none"
      }
    ];
  }
  const allSprints = getAllSprints();
  const disciplines = getDisciplines();
  const roleList = disciplines[role] || [];
  const options = [];
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:73',message:'Data loaded for sprint options',data:{sprintsCount:allSprints.length,roleListLength:roleList.length,role:role,timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

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
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:102',message:'buildUserSprintOptions exit',data:{optionsCount:options.length,options:JSON.stringify(options).substring(0,300),timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  return options;
}

/**
 * buildInfoModal:
 * Simple informational modal that is always valid.
 */
function buildInfoModal({ title, bodyText, closeText = "Close" }) {
  return {
    type: "modal",
    callback_id: "override_info_modal",
    title: { type: "plain_text", text: title },
    close: { type: "plain_text", text: closeText },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: bodyText }
      }
    ]
  };
}

/**
 * buildOverrideStep1Modal:
 * Step 1 (choose sprint). No submit button; selecting a sprint triggers views.update to Step 2.
 */
function buildOverrideStep1Modal(requesterSlackId) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:buildOverrideStep1Modal',message:'buildOverrideStep1Modal entry',data:{requesterSlackId:requesterSlackId,timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  const role = getUserRole(requesterSlackId);
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:buildOverrideStep1Modal',message:'Role in buildOverrideStep1Modal',data:{requesterSlackId:requesterSlackId,role:role,roleIsNull:role===null,timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'C,F'})}).catch(()=>{});
  // #endregion

  if (!role) {
    return buildInfoModal({
      title: "Request Coverage",
      bodyText:
        "*You’re not currently on a triage rotation list.*\n\nPlease contact an admin to add you to the appropriate role before requesting coverage."
    });
  }

  // Store role and requester in private_metadata so action handlers can build Step 2.
  const privateMetadata = JSON.stringify({ role, requester: requesterSlackId });

  const sprintOptionsAll = buildUserSprintOptions(requesterSlackId);
  if (sprintOptionsAll.length === 1 && sprintOptionsAll[0].value === "none") {
    return buildInfoModal({
      title: "Request Coverage",
      bodyText:
        "*No scheduled sprints found for you.*\n\nIf you believe this is incorrect, contact an admin to verify your rotation assignment."
    });
  }

  // Slack static_select supports max 100 options.
  const sprintOptions = sprintOptionsAll.slice(0, 100);

  const modal = {
    type: "modal",
    callback_id: "override_request_step1",
    private_metadata: privateMetadata,
    title: { type: "plain_text", text: "Request Coverage" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Select the sprint you need coverage for. You’ll choose a replacement on the next step."
        }
      },
      {
        type: "input",
        block_id: "sprint_selection",
        element: {
          type: "static_select",
          action_id: "sprint_select",
          placeholder: { type: "plain_text", text: "Select a sprint" },
          options: sprintOptions
        },
        label: { type: "plain_text", text: "Which sprint do you need coverage for?" }
      },
      {
        type: "context",
        block_id: "note",
        elements: [
          {
            type: "mrkdwn",
            text:
              sprintOptionsAll.length > 100
                ? `_Showing first 100 of ${sprintOptionsAll.length} eligible sprints._`
                : "If you don’t see the right sprint, contact an admin to verify the sprint schedule and rotation lists."
          }
        ]
      }
    ]
  };
  
  // #region agent log
  const modalStr = JSON.stringify(modal);
  fetch('http://127.0.0.1:7242/ingest/45e398a0-8e28-4077-8fd8-7614c6cc730c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overrideModal.js:buildOverrideStep1Modal',message:'buildOverrideStep1Modal exit',data:{sprintOptionsCount:sprintOptions.length,modalSize:modalStr.length,privateMetadataSize:privateMetadata.length,hasSprintOptions:sprintOptions.length>0,modalStructure:modalStr.substring(0,500),timestamp:Date.now()},sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
  // #endregion

  return modal;
}

/**
 * buildOverrideStep2Modal:
 * Step 2 (choose replacement + submit). Uses external_select for replacement.
 *
 * IMPORTANT: Keeps block_ids/action_ids stable so the existing view submission handler
 * (`override_request_modal`) can continue to read `view.state.values`.
 */
function buildOverrideStep2Modal({ requesterSlackId, role, sprintIndex }) {
  const privateMetadata = JSON.stringify({ role, requester: requesterSlackId, sprintIndex });

  const sprintOptionsAll = buildUserSprintOptions(requesterSlackId);
  const sprintOptions = sprintOptionsAll.slice(0, 100);

  const initialOption =
    sprintOptionsAll.find(opt => opt.value === String(sprintIndex)) ||
    sprintOptions[0];

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
          type: "static_select",
          action_id: "sprint_select",
          placeholder: { type: "plain_text", text: "Select a sprint" },
          options: sprintOptions,
          initial_option: initialOption
        },
        label: { type: "plain_text", text: "Sprint" }
      },
      {
        type: "input",
        block_id: "replacement",
        element: {
          type: "external_select",
          action_id: "replacement_select",
          placeholder: { type: "plain_text", text: "Search for a replacement" },
          min_query_length: 0
        },
        label: { type: "plain_text", text: "Replacement" }
      },
      {
        type: "context",
        block_id: "note",
        elements: [
          {
            type: "mrkdwn",
            text:
              "Start typing to search within your role. If the right person doesn’t appear, contact an admin to update the rotation list."
          }
        ]
      }
    ]
  };
}

// Backwards compatible export name: existing callers open Step 1 first.
function buildOverrideRequestModal(requesterSlackId) {
  return buildOverrideStep1Modal(requesterSlackId);
}

module.exports = { buildOverrideRequestModal, buildOverrideStep1Modal, buildOverrideStep2Modal };
