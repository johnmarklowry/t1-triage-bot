/********************************
 * slackNotifier.js
 ********************************/
const { WebClient } = require('@slack/web-api');
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Sends a direct message to a user.
 */
async function notifyUser(userId, text) {
  if (!userId) return;
  try {
    const { channel } = await slackClient.conversations.open({ users: userId });
    await slackClient.chat.postMessage({ channel: channel.id, text });
  } catch (err) {
    console.error(`Failed to DM user ${userId}:`, err);
    await notifyAdmins(`Failed to DM <@${userId}>: ${err.message}`);
  }
}

/**
 * Sends a message to the admin channel.
 */
async function notifyAdmins(text) {
  if (!process.env.ADMIN_CHANNEL_ID) {
    console.error('[notifyAdmins] No ADMIN_CHANNEL_ID. Message:', text);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `[ERROR] ${text}`
    });
  } catch (err) {
    console.error('Failed to notify admins:', err);
  }
}

/**
 * Updates the channel topic for the bug triage channel.
 * The topic is set to:
 * "Bug Link Only - keep conversations in threads.
 *  Triage Team: {New Triage Members}"
 */
async function updateChannelTopic(userIdsArray) {
  try {
    // Format the user IDs as @mentions
    const mentionList = userIdsArray.map(id => `<@${id}>`).join(', ');
    
    // Create the full topic message
    const newTopic = 
      `Bug Link Only - keep conversations in threads.\n` +
      `Triage Team: ${mentionList}`;
    
    await slackClient.conversations.setTopic({
      channel: process.env.BUG_TRIAGE_CHANNEL_ID,
      topic: newTopic
    });
    console.log(`[updateChannelTopic] Channel ${process.env.BUG_TRIAGE_CHANNEL_ID} topic updated.`);
  } catch (err) {
    console.error('[updateChannelTopic] Error:', err);
    await notifyAdmins(`Error updating channel topic for ${process.env.BUG_TRIAGE_CHANNEL_ID}: ${err.message}`);
  }
}

/**
 * Updates the Slack user group for on-call members.
 * In staging (APP_ENV/ENVIRONMENT=staging), uses SLACK_USERGROUP_ID_STAGING only; never updates production group.
 */
async function updateOnCallUserGroup(userIdsArray) {
  const isStaging = process.env.APP_ENV === 'staging' || process.env.ENVIRONMENT === 'staging' || process.env.NODE_ENV === 'staging';
  const usergroupId = isStaging
    ? process.env.SLACK_USERGROUP_ID_STAGING
    : process.env.SLACK_USERGROUP_ID;

  if (!usergroupId) {
    if (isStaging) {
      console.warn('[updateOnCallUserGroup] Staging: SLACK_USERGROUP_ID_STAGING is missing. Skipping update (production group is never updated from staging).');
    } else {
      console.warn('[updateOnCallUserGroup] SLACK_USERGROUP_ID is missing. Skipping update.');
    }
    return;
  }
  try {
    await slackClient.usergroups.users.update({
      usergroup: usergroupId,
      users: userIdsArray.join(',')
    });
    console.log('[updateOnCallUserGroup] User group updated successfully.');
  } catch (err) {
    console.error('Failed to update user group:', err);
    await notifyAdmins(`Error updating Slack user group: ${err.message}`);
  }
}

/**
 * Notify users whose rotation status changed.
 * @param {Array<{role: string, oldUser?: string|null, newUser?: string|null}>} changes
 */
async function notifyRotationChanges(changes = []) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { sent: 0 };
  }

  let sent = 0;

  for (const change of changes) {
    const { role, newUser, oldUser } = change;

    if (newUser) {
      await notifyUser(
        newUser,
        `You have been assigned to ${role} triage duty starting now.`
      );
      sent += 1;
    }

    if (oldUser) {
      await notifyUser(
        oldUser,
        `You have been removed from ${role} triage duty.`
      );
      sent += 1;
    }
  }

  return { sent };
}

module.exports = {
  notifyUser,
  notifyAdmins,
  updateOnCallUserGroup,
  updateChannelTopic,
  notifyRotationChanges
};
