/********************************
 * overrideHandler.js
 ********************************/
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { slackApp, receiver } = require('./appHome');
const { buildOverrideRequestModal } = require('./overrideModal');

// Path to JSON data
const OVERRIDES_FILE = path.join(__dirname, 'overrides.json');
const DISCIPLINES_FILE = path.join(__dirname, 'disciplines.json');

/* =========================
   Helpers
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

/* =========================
   /triage-override Command
   (User Flow)
   ========================= */
slackApp.command('/triage-override', async ({ command, ack, client, logger }) => {
  await ack();

  // Determine user's role
  const userRole = getUserRole(command.user_id);
  // Build the modal for requesting an override
  const modalView = buildOverrideRequestModal(command.user_id);
  try {
    await client.views.open({
      trigger_id: command.trigger_id,
      view: modalView
    });
  } catch (error) {
    logger.error("Error opening override modal:", error);
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
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: modalView
    });
  } catch (err) {
    logger.error("Error opening coverage request modal from shortcut:", err);
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

    // Extract the replacement Slack ID
    const replacementSlackId = view.state.values.replacement.replacement_select.selected_option.value;

    // Look up replacement name from disciplines
    const disciplines = getDisciplines();
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

    // Save override
    let overrides = loadOverrides();
    if (!Array.isArray(overrides)) {
      overrides = [];
    }
    overrides.push(override);
    saveOverrides(overrides);

    // Notify admin channel with Approve/Decline buttons
    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Override Request: <@${requesterId}> has requested an override for *${requesterRole}* on sprint index ${sprintIndex}. Replacement: <@${replacementSlackId}> (${replacementName}). Please review and approve.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Override Request: <@${requesterId}> has requested an override for *${requesterRole}* on sprint index ${sprintIndex}.\nReplacement: <@${replacementSlackId}> (${replacementName}).`
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
    let overrides = loadOverrides();
    // Find matching override
    const idx = overrides.findIndex(o =>
      o.sprintIndex === overrideInfo.sprintIndex &&
      o.role === overrideInfo.role &&
      o.requestedBy === overrideInfo.requesterId &&
      o.newSlackId === overrideInfo.replacementSlackId &&
      o.approved === false
    );
    if (idx > -1) {
      overrides[idx].approved = true;
      overrides[idx].approvedBy = body.user.id;
      overrides[idx].approvalTimestamp = new Date().toISOString();
      saveOverrides(overrides);

      // Notify the requester and replacement
      await client.chat.postMessage({
        channel: overrideInfo.requesterId,
        text: `Your override request for ${overrideInfo.role} on sprint index ${overrideInfo.sprintIndex} has been approved.`
      });
      await client.chat.postMessage({
        channel: overrideInfo.replacementSlackId,
        text: `You have been approved as the replacement for ${overrideInfo.role} on sprint index ${overrideInfo.sprintIndex}.`
      });
      // Update the admin channel message
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: "Override Approved (Details in blocks)",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:white_check_mark: *Override Approved*\n` +
                     `*Sprint Index:* ${overrideInfo.sprintIndex}\n` +
                     `*Role:* ${overrideInfo.role}\n` +
                     `*Requested By:* <@${overrideInfo.requesterId}>\n` +
                     `*Replacement:* <@${overrideInfo.replacementSlackId}> (${overrideInfo.replacementName || overrideInfo.replacementSlackId})\n` +
                     `*Approved By:* <@${body.user.id}> at ${overrides[idx].approvalTimestamp}\n`
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
    let overrides = loadOverrides();
    // Remove the matching override
    overrides = overrides.filter(o =>
      !(o.sprintIndex === overrideInfo.sprintIndex &&
        o.role === overrideInfo.role &&
        o.requestedBy === overrideInfo.requesterId &&
        o.newSlackId === overrideInfo.replacementSlackId &&
        o.approved === false)
    );
    saveOverrides(overrides);

    // Notify the requester
    await client.chat.postMessage({
      channel: overrideInfo.requesterId,
      text: `Your override request for ${overrideInfo.role} on sprint index ${overrideInfo.sprintIndex} has been declined.`
    });
    // Update the admin channel message
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: "Override Declined (Details in blocks)",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:x: *Override Declined*\n` +
                   `*Sprint Index:* ${overrideInfo.sprintIndex}\n` +
                   `*Role:* ${overrideInfo.role}\n` +
                   `*Requested By:* <@${overrideInfo.requesterId}>\n` +
                   `*Replacement:* <@${overrideInfo.replacementSlackId}>\n` +
                   `*Declined By:* <@${body.user.id}> at ${new Date().toISOString()}\n`
          }
        }
      ]
    });
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
slackApp.command('/override-list', async ({ command, ack, client, logger }) => {
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
    const overrides = loadOverrides();
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
    let overrides = loadOverrides();
    if (index < 0 || index >= overrides.length) {
      logger.error("Invalid override index:", index);
      return;
    }
    const removed = overrides.splice(index, 1)[0];
    saveOverrides(overrides);

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
    const updatedView = buildOverrideListModal(overrides);
    await client.views.update({
      view_id: body.view.id,
      view: updatedView
    });
  } catch (err) {
    logger.error("Error removing override from /override-list modal:", err);
  }
});

module.exports = {};
