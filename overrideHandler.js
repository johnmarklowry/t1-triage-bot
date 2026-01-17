/********************************
 * overrideHandler.js
 * Updated to use PostgreSQL database with transaction support
 ********************************/
require('./loadEnv').loadEnv();
const fs = require('fs');
const path = require('path');
const { slackApp, receiver } = require('./appHome');
const { getEnvironmentCommand } = require('./commandUtils');
const { buildOverrideRequestModal, buildOverrideStep2Modal, buildMinimalDebugModal } = require('./overrideModal');

// Import database repositories
const { UsersRepository, OverridesRepository } = require('./db/repository');

// Path to JSON data (kept for fallback)
const OVERRIDES_FILE = path.join(__dirname, 'overrides.json');
const DISCIPLINES_FILE = path.join(__dirname, 'disciplines.json');
const SPRINTS_FILE = path.join(__dirname, 'sprints.json');

// Configuration
const USE_DATABASE = process.env.USE_DATABASE !== 'false';
const DUAL_WRITE_MODE = process.env.DUAL_WRITE_MODE !== 'false';

/* =========================
   Helpers (Legacy support)
   ========================= */
function loadOverrides() {
  try {
    const data = fs.readFileSync(OVERRIDES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading overrides:", err);
    return [];
  }
}

function saveOverrides(overrides) {
  try {
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving overrides:", err);
  }
}

function getDisciplines() {
  try {
    const data = fs.readFileSync(DISCIPLINES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading disciplines:", err);
    return {};
  }
}

function getSprints() {
  try {
    const data = fs.readFileSync(SPRINTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading sprints:", err);
    return [];
  }
}

function formatSprintLabel(sprintIndex) {
  const idx = Number.parseInt(String(sprintIndex), 10);
  if (!Number.isFinite(idx)) return `Sprint ${sprintIndex}`;

  const sprints = getSprints();
  const sprint = Array.isArray(sprints) ? sprints[idx] : null;
  if (!sprint) return `Sprint ${idx}`;

  const name = sprint.sprintName || `Sprint ${idx}`;
  const start = sprint.startDate || '';
  const end = sprint.endDate || '';
  const range = start && end ? `${start} to ${end}` : (start || end || '');
  return range ? `${name} (${range})` : name;
}

/* =========================
   Database Helpers
   ========================= */
async function getUserRole(userId) {
  if (!USE_DATABASE) {
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

  try {
    const disciplines = await UsersRepository.getDisciplines();
    for (const role in disciplines) {
      const users = disciplines[role];
      if (Array.isArray(users)) {
        for (const user of users) {
          if (user.slackId === userId) {
            return role;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error('[getUserRole] Database error:', error);
    // Fallback to JSON
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
}

async function addOverrideRequest(overrideData) {
  if (!USE_DATABASE) {
    let overrides = loadOverrides();
    if (!Array.isArray(overrides)) {
      overrides = [];
    }
    overrides.push(overrideData);
    saveOverrides(overrides);
    return true;
  }

  try {
    await OverridesRepository.addOverride(overrideData, overrideData.requestedBy);
    
    // Dual-write to JSON if enabled
    if (DUAL_WRITE_MODE) {
      let overrides = loadOverrides();
      if (!Array.isArray(overrides)) {
        overrides = [];
      }
      overrides.push(overrideData);
      saveOverrides(overrides);
    }
    
    return true;
  } catch (error) {
    console.error('[addOverrideRequest] Database error:', error);
    // Fallback to JSON
    let overrides = loadOverrides();
    if (!Array.isArray(overrides)) {
      overrides = [];
    }
    overrides.push(overrideData);
    saveOverrides(overrides);
    return true;
  }
}

async function approveOverride(sprintIndex, role, requestedBy, replacementSlackId, approvedBy) {
  if (!USE_DATABASE) {
    let overrides = loadOverrides();
    const idx = overrides.findIndex(o =>
      o.sprintIndex === sprintIndex &&
      o.role === role &&
      o.requestedBy === requestedBy &&
      o.newSlackId === replacementSlackId &&
      o.approved === false
    );
    
    if (idx > -1) {
      overrides[idx].approved = true;
      overrides[idx].approvedBy = approvedBy;
      overrides[idx].approvalTimestamp = new Date().toISOString();
      saveOverrides(overrides);
      return overrides[idx];
    }
    return null;
  }

  try {
    const result = await OverridesRepository.approveOverride(
      sprintIndex, role, requestedBy, replacementSlackId, approvedBy
    );
    
    // Dual-write to JSON if enabled
    if (DUAL_WRITE_MODE && result) {
      let overrides = loadOverrides();
      const idx = overrides.findIndex(o =>
        o.sprintIndex === sprintIndex &&
        o.role === role &&
        o.requestedBy === requestedBy &&
        o.newSlackId === replacementSlackId &&
        o.approved === false
      );
      
      if (idx > -1) {
        overrides[idx].approved = true;
        overrides[idx].approvedBy = approvedBy;
        overrides[idx].approvalTimestamp = new Date().toISOString();
        saveOverrides(overrides);
      }
    }
    
    return result;
  } catch (error) {
    console.error('[approveOverride] Database error:', error);
    // Fallback to JSON
    let overrides = loadOverrides();
    const idx = overrides.findIndex(o =>
      o.sprintIndex === sprintIndex &&
      o.role === role &&
      o.requestedBy === requestedBy &&
      o.newSlackId === replacementSlackId &&
      o.approved === false
    );
    
    if (idx > -1) {
      overrides[idx].approved = true;
      overrides[idx].approvedBy = approvedBy;
      overrides[idx].approvalTimestamp = new Date().toISOString();
      saveOverrides(overrides);
      return overrides[idx];
    }
    return null;
  }
}

async function declineOverride(sprintIndex, role, requestedBy, replacementSlackId, declinedBy) {
  if (!USE_DATABASE) {
    let overrides = loadOverrides();
    overrides = overrides.filter(o =>
      !(o.sprintIndex === sprintIndex &&
        o.role === role &&
        o.requestedBy === requestedBy &&
        o.newSlackId === replacementSlackId &&
        o.approved === false)
    );
    saveOverrides(overrides);
    return true;
  }

  try {
    const result = await OverridesRepository.declineOverride(
      sprintIndex, role, requestedBy, replacementSlackId, declinedBy
    );
    
    // Dual-write to JSON if enabled
    if (DUAL_WRITE_MODE) {
      let overrides = loadOverrides();
      overrides = overrides.filter(o =>
        !(o.sprintIndex === sprintIndex &&
          o.role === role &&
          o.requestedBy === requestedBy &&
          o.newSlackId === replacementSlackId &&
          o.approved === false)
      );
      saveOverrides(overrides);
    }
    
    return result;
  } catch (error) {
    console.error('[declineOverride] Database error:', error);
    // Fallback to JSON
    let overrides = loadOverrides();
    overrides = overrides.filter(o =>
      !(o.sprintIndex === sprintIndex &&
        o.role === role &&
        o.requestedBy === requestedBy &&
        o.newSlackId === replacementSlackId &&
        o.approved === false)
    );
    saveOverrides(overrides);
    return true;
  }
}

async function getAllOverrides() {
  if (!USE_DATABASE) {
    return loadOverrides();
  }

  try {
    const overrides = await OverridesRepository.getAll();
    return overrides.map(override => ({
      id: override.id,
      sprintIndex: override.sprintIndex,
      role: override.role,
      originalSlackId: override.originalSlackId,
      newSlackId: override.newSlackId,
      newName: override.newName,
      requestedBy: override.requestedBy,
      approved: override.approved,
      approvedBy: override.approvedBy,
      approvalTimestamp: override.approvalTimestamp,
      timestamp: override.timestamp
    }));
  } catch (error) {
    console.error('[getAllOverrides] Database error:', error);
    // Fallback to JSON
    return loadOverrides();
  }
}

/* =========================
   /triage-override Command
   (User Flow)
   ========================= */
slackApp.command(getEnvironmentCommand('triage-override'), async ({ command, ack, client, logger }) => {
  await ack();

  const interactivityPointer =
    command?.interactivity?.interactivity_pointer ||
    command?.interactivity_pointer ||
    null;

  // Determine user's role
  const userRole = await getUserRole(command.user_id);

  // Build the modal for requesting an override
  const modalView = buildOverrideRequestModal(command.user_id);

  try {
    // Open minimal probe first, then update to the real modal.
    const probeView = buildMinimalDebugModal({
      title: 'Request Coverage',
      bodyText: 'Opening coverage request…',
      callbackId: 'debug_probe_triage_override'
    });

    const openArgs = interactivityPointer
      ? { interactivity_pointer: interactivityPointer, view: probeView }
      : { trigger_id: command.trigger_id, view: probeView };

    const result = await client.views.open(openArgs);

    await client.views.update({
      view_id: result.view.id,
      hash: result.view.hash,
      view: modalView
    });
  } catch (error) {
    logger.error("Error opening override modal:", error);

    // If views.open fails with internal_error, try a simple chat.postMessage to see if other Web API calls succeed.
    if (error?.data?.error === 'internal_error') {
      try {
        const msg = await client.chat.postMessage({
          channel: command.channel_id,
          text: "Debug: `views.open` returned `internal_error` while opening the override modal."
        });
      } catch (e) {
      }
    }
  }
});

/**
 * Slack channel shortcut: request_coverage_shortcut
 */
slackApp.shortcut('request_coverage_shortcut', async ({ shortcut, ack, client, logger }) => {
  await ack();
  try {
    const userId = shortcut.user.id;
    const modalView = buildOverrideRequestModal(userId);
    const probeView = buildMinimalDebugModal({
      title: 'Request Coverage',
      bodyText: 'Opening coverage request…',
      callbackId: 'debug_probe_shortcut'
    });

    const opened = await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: probeView
    });

    await client.views.update({
      view_id: opened.view.id,
      hash: opened.view.hash,
      view: modalView
    });
  } catch (err) {
    logger.error("Error opening coverage request modal from shortcut:", err);
  }
});

/**
 * Step 1 -> Step 2 transition:
 * When a user selects a sprint in the Step 1 modal, update the view to Step 2.
 */
slackApp.action('sprint_select', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const view = body?.view;
    const action = body?.actions?.[0];
    const selectedValue = action?.selected_option?.value;

    if (!view?.id || !selectedValue || selectedValue === 'none') {
      return;
    }

    // Only transition from Step 1; if a user changes sprint in Step 2, we leave it as-is.
    if (view.callback_id && view.callback_id !== 'override_request_step1') {
      return;
    }

    if (typeof logger?.info === 'function') {
      logger.info('[overrideHandler] Sprint selected in Step 1 modal', {
        callbackId: view.callback_id,
        requester: body?.user?.id,
        selectedValue
      });
    }

    let metadata = {};
    try {
      metadata = JSON.parse(view.private_metadata || '{}');
    } catch {
      metadata = {};
    }

    const requesterSlackId = metadata.requester || body?.user?.id;
    let role = metadata.role || null;
    if (!role && requesterSlackId) {
      role = await getUserRole(requesterSlackId);
    }

    const sprintIndex = parseInt(selectedValue, 10);
    if (!Number.isFinite(sprintIndex) || !requesterSlackId || !role) {
      return;
    }

    const nextView = buildOverrideStep2Modal({ requesterSlackId, role, sprintIndex });
    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      view: nextView
    });
  } catch (error) {
    logger.error('[overrideHandler] Error transitioning to Step 2 modal:', error, {
      errorMessage: error.message,
      errorCode: error.code,
      responseMetadata: error.data?.response_metadata
    });
  }
});

/**
 * external_select options handler for replacement search.
 * Returns up to 100 role-filtered user options (excluding requester).
 */
slackApp.options('replacement_select', async ({ ack, body, payload, logger }) => {
  try {
    const query = (payload?.value || body?.value || '').toString().trim().toLowerCase();
    const view = body?.view;

    let metadata = {};
    try {
      metadata = JSON.parse(view?.private_metadata || '{}');
    } catch {
      metadata = {};
    }

    const requesterSlackId = metadata.requester || body?.user?.id;
    let role = metadata.role || null;
    if (!role && requesterSlackId) {
      role = await getUserRole(requesterSlackId);
    }

    if (!role) {
      await ack({ options: [] });
      return;
    }

    const disciplines = USE_DATABASE ? await UsersRepository.getDisciplines() : getDisciplines();
    const roleList = Array.isArray(disciplines?.[role]) ? disciplines[role] : [];

    const matches = roleList
      .filter(u => u && u.slackId && u.slackId !== requesterSlackId)
      .filter(u => {
        if (!query) return true;
        const name = (u.name || '').toString().toLowerCase();
        const slackId = (u.slackId || '').toString().toLowerCase();
        return name.includes(query) || slackId.includes(query);
      })
      .slice(0, 100)
      .map(u => {
        const name = (u.name || u.slackId || 'Unknown').toString();
        const safeName = name.length > 75 ? `${name.slice(0, 72)}...` : name;
        return {
          text: { type: 'plain_text', text: safeName },
          value: u.slackId.toString()
        };
      });

    if (typeof logger?.info === 'function') {
      logger.info('[overrideHandler] Replacement options served', {
        role,
        requester: requesterSlackId,
        query: query || '',
        returned: matches.length
      });
    }

    await ack({ options: matches });
  } catch (error) {
    logger.error('[overrideHandler] Error serving replacement options:', error, {
      errorMessage: error.message,
      errorCode: error.code,
      responseMetadata: error.data?.response_metadata
    });
    await ack({ options: [] });
  }
});

/**
 * handle override_request_modal view submission
 * (existing flow: user picks sprint + replacement)
 * -> Notifies admin channel with Approve/Decline
 */
slackApp.view('override_request_modal', async ({ ack, body, view, client, logger }) => {
  await ack();
  try {
    // Parse private_metadata
    const metadata = JSON.parse(view.private_metadata);
    const requesterRole = metadata.role;
    const requesterId = metadata.requester;

    // Extract the selected sprint index
    const sprintIndexStr = view.state.values.sprint_selection.sprint_select.selected_option.value;
    const sprintIndex = parseInt(sprintIndexStr, 10);
    const sprintLabel = formatSprintLabel(sprintIndex);

    // Extract the replacement Slack ID
    const replacementSlackId = view.state.values.replacement.replacement_select.selected_option.value;

    // Look up replacement name from disciplines
    const disciplines = USE_DATABASE ? await UsersRepository.getDisciplines() : getDisciplines();
    const roleList = disciplines[requesterRole] || [];
    let replacementName = replacementSlackId;
    const replacementObj = roleList.find(u => u.slackId === replacementSlackId);
    if (replacementObj) {
      replacementName = replacementObj.name;
    }

    // Create override object
    const override = {
      sprintIndex,
      role: requesterRole,
      newSlackId: replacementSlackId,
      newName: replacementName,
      requestedBy: requesterId,
      approved: false,
      timestamp: new Date().toISOString()
    };

    // Save override using database or JSON
    await addOverrideRequest(override);

    // Notify admin channel with Approve/Decline buttons
    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Override Request: <@${requesterId}> has requested an override for *${requesterRole}* on *${sprintLabel}*. Replacement: <@${replacementSlackId}> (${replacementName}). Please review and approve.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Override Request: <@${requesterId}> has requested an override for *${requesterRole}* on *${sprintLabel}*.\nReplacement: <@${replacementSlackId}> (${replacementName}).`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve" },
              style: "primary",
              action_id: "approve_override",
              value: JSON.stringify({ 
                sprintIndex, 
                sprintLabel,
                role: requesterRole, 
                replacementSlackId, 
                replacementName, 
                requesterId 
              })
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Decline" },
              style: "danger",
              action_id: "decline_override",
              value: JSON.stringify({ 
                sprintIndex, 
                sprintLabel,
                role: requesterRole, 
                replacementSlackId, 
                requesterId 
              })
            }
          ]
        }
      ]
    });
  } catch (error) {
    logger.error("Error in override_request_modal handler:", error);
  }
});

/* =========================
   Action: approve_override
   (Admin channel flow)
   ========================= */
slackApp.action('approve_override', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const overrideInfo = JSON.parse(body.actions[0].value);
    const sprintLabel = overrideInfo.sprintLabel || formatSprintLabel(overrideInfo.sprintIndex);
    
    const result = await approveOverride(
      overrideInfo.sprintIndex,
      overrideInfo.role,
      overrideInfo.requesterId,
      overrideInfo.replacementSlackId,
      body.user.id
    );
    
    if (result) {
      // Notify the requester and replacement
      await client.chat.postMessage({
        channel: overrideInfo.requesterId,
        text: `Your override request for ${overrideInfo.role} on ${sprintLabel} has been approved.`
      });
      await client.chat.postMessage({
        channel: overrideInfo.replacementSlackId,
        text: `You have been approved as the replacement for ${overrideInfo.role} on ${sprintLabel}.`
      });
      
      // Update the admin channel message
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: "Override Approved",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Override Approved*\n` +
                `Sprint: ${sprintLabel}\n` +
                `Role: ${overrideInfo.role}\n` +
                `Requested By: <@${overrideInfo.requesterId}>\n` +
                `Replacement: <@${overrideInfo.replacementSlackId}> (${overrideInfo.replacementName || overrideInfo.replacementSlackId})\n` +
                `Approved By: <@${body.user.id}> at ${result.approvalTimestamp || new Date().toISOString()}`
            }
          }
        ]
      });
    }
  } catch (error) {
    logger.error("Error approving override:", error);
  }
});

/* =========================
   Action: decline_override
   (Admin channel flow)
   ========================= */
slackApp.action('decline_override', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const overrideInfo = JSON.parse(body.actions[0].value);
    const sprintLabel = overrideInfo.sprintLabel || formatSprintLabel(overrideInfo.sprintIndex);
    
    const result = await declineOverride(
      overrideInfo.sprintIndex,
      overrideInfo.role,
      overrideInfo.requesterId,
      overrideInfo.replacementSlackId,
      body.user.id
    );
    
    if (result) {
      // Notify the requester
      await client.chat.postMessage({
        channel: overrideInfo.requesterId,
        text: `Your override request for ${overrideInfo.role} on ${sprintLabel} has been declined.`
      });
      
      // Update the admin channel message
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: "Override Declined",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Override Declined*\n` +
                `Sprint: ${sprintLabel}\n` +
                `Role: ${overrideInfo.role}\n` +
                `Requested By: <@${overrideInfo.requesterId}>\n` +
                `Replacement: <@${overrideInfo.replacementSlackId}>\n` +
                `Declined By: <@${body.user.id}> at ${new Date().toISOString()}`
            }
          }
        ]
      });
    }
  } catch (error) {
    logger.error("Error declining override:", error);
  }
});

/* =========================
   /override-list
   Admin command to list overrides in a modal
   with the option to remove them after the fact.
   (One might also add 'approve' if not approved.)
========================= */
slackApp.command(getEnvironmentCommand('override-list'), async ({ command, ack, client, logger }) => {
  await ack();
  try {
    // Check if user is in the admin channel
    if (command.channel_id !== process.env.ADMIN_CHANNEL_ID) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: "This command can only be used in the admin channel."
      });
      return;
    }
    
    // Build and open the modal
    const overrides = await getAllOverrides();
    const modalView = buildOverrideListModal(overrides);
    await client.views.open({
      trigger_id: command.trigger_id,
      view: modalView
    });
  } catch (err) {
    logger.error("Error opening override-list modal:", err);
  }
});

/**
 * buildOverrideListModal:
 * Lists all overrides in a single modal. Each override can be "removed" (decline).
 * If you want to allow approval from here, you can add an 'Approve' button as well.
 */
function buildOverrideListModal(overrides) {
  if (!overrides || overrides.length === 0) {
    return {
      type: "modal",
      title: { type: "plain_text", text: "Override List" },
      close: { type: "plain_text", text: "Close" },
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "No overrides found." }
        }
      ]
    };
  }
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "Current Overrides" }
    },
    { type: "divider" }
  ];
  
  overrides.forEach((o, idx) => {
    const desc = `*Sprint Index:* ${o.sprintIndex}\n*Role:* ${o.role}\n*Requested By:* <@${o.requestedBy}>\n*Replacement:* <@${o.newSlackId}> (${o.newName || o.newSlackId})\n*Approved:* ${o.approved ? "Yes" : "No"}`;
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: desc },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Remove" },
        style: "danger",
        action_id: "admin_remove_override",
        value: JSON.stringify({ index: idx })
      }
    });
    blocks.push({ type: "divider" });
  });
  
  return {
    type: "modal",
    callback_id: "admin_override_list_modal",
    title: { type: "plain_text", text: "Override List" },
    close: { type: "plain_text", text: "Close" },
    blocks
  };
}

/**
 * admin_remove_override:
 * Removes an override from the array. If you want to revert on-call state,
 * you could optionally call rotation logic or direct user updates here.
 */
slackApp.action('admin_remove_override', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const { index } = JSON.parse(body.actions[0].value);
    const overrides = await getAllOverrides();
    
    if (index < 0 || index >= overrides.length) {
      logger.error("Invalid override index:", index);
      return;
    }
    
    const removed = overrides[index];
    
    // Remove from database or JSON
    if (USE_DATABASE) {
      try {
        await OverridesRepository.declineOverride(
          removed.sprintIndex,
          removed.role,
          removed.requestedBy,
          removed.newSlackId,
          body.user.id
        );
      } catch (error) {
        console.error('[admin_remove_override] Database error:', error);
        // Fallback to JSON removal
        overrides.splice(index, 1);
        saveOverrides(overrides);
      }
    } else {
      overrides.splice(index, 1);
      saveOverrides(overrides);
    }

    // Optionally notify the parties that the override was forcibly removed
    await client.chat.postMessage({
      channel: removed.requestedBy,
      text: `The override for *${removed.role}* on sprint index ${removed.sprintIndex} was removed by an admin. You are on call.`
    });
    await client.chat.postMessage({
      channel: removed.newSlackId,
      text: `The override for *${removed.role}* on sprint index ${removed.sprintIndex} was removed by an admin. You are not on call.`
    });

    // Refresh the modal
    const updatedOverrides = await getAllOverrides();
    const updatedView = buildOverrideListModal(updatedOverrides);
    await client.views.update({
      view_id: body.view.id,
      view: updatedView
    });
  } catch (err) {
    logger.error("Error removing override from /override-list modal:", err);
  }
});

module.exports = {};