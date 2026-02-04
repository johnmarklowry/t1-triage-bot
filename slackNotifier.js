/********************************
 * slackNotifier.js
 ********************************/
const { WebClient } = require('@slack/web-api');
const config = require('./config');
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const STAGING_USERGROUP_HANDLE = 'triage-oncall-staging';
const STAGING_USERGROUP_NAME = 'Triage On-Call (Staging)';
let _stagingUserGroupId = null;
let _stagingUserGroupIdLogged = false;

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
 * Resolve staging on-call user group ID: find by handle or create. Cached per process.
 * @returns {Promise<string|null>} Usergroup ID or null on error / missing scope.
 */
async function getOrCreateStagingOnCallUserGroupId() {
  if (_stagingUserGroupId) return _stagingUserGroupId;

  try {
    const listRes = await slackClient.usergroups.list({ include_disabled: false });
    const groups = listRes?.usergroups || [];
    const found = groups.find(g => (g.handle || '').toLowerCase() === STAGING_USERGROUP_HANDLE);
    if (found && found.id) {
      _stagingUserGroupId = found.id;
      return _stagingUserGroupId;
    }

    const createRes = await slackClient.usergroups.create({
      name: STAGING_USERGROUP_NAME,
      handle: STAGING_USERGROUP_HANDLE,
      description: 'On-call participants for triage (staging)'
    });
    const created = createRes?.usergroup;
    if (created && created.id) {
      _stagingUserGroupId = created.id;
      console.log(`[getOrCreateStagingOnCallUserGroupId] Created staging user group ${_stagingUserGroupId}. Set SLACK_USERGROUP_ID_STAGING=${_stagingUserGroupId} in env to avoid lookup.`);
      return _stagingUserGroupId;
    }

    return null;
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('already_taken') || msg.includes('handle')) {
      try {
        const listRes = await slackClient.usergroups.list({ include_disabled: false });
        const groups = listRes?.usergroups || [];
        const found = groups.find(g => (g.handle || '').toLowerCase() === STAGING_USERGROUP_HANDLE);
        if (found && found.id) {
          _stagingUserGroupId = found.id;
          return _stagingUserGroupId;
        }
      } catch (e) {
        console.warn('[getOrCreateStagingOnCallUserGroupId] List retry failed:', e?.message || e);
      }
    }
    console.warn('[getOrCreateStagingOnCallUserGroupId] Failed:', msg.slice(0, 200));
    return null;
  }
}

/**
 * Updates the Slack user group for on-call members.
 * In staging, uses SLACK_USERGROUP_ID_STAGING or auto-created/found group; never updates production group.
 */
async function updateOnCallUserGroup(userIdsArray) {
  const isStaging = config.isStaging;
  let usergroupId = isStaging
    ? process.env.SLACK_USERGROUP_ID_STAGING
    : process.env.SLACK_USERGROUP_ID;

  if (isStaging && !usergroupId) {
    usergroupId = await getOrCreateStagingOnCallUserGroupId();
    if (usergroupId && !_stagingUserGroupIdLogged) {
      _stagingUserGroupIdLogged = true;
      console.log(`[updateOnCallUserGroup] Using staging on-call user group ${usergroupId}. Set SLACK_USERGROUP_ID_STAGING=${usergroupId} in env to pin it.`);
    }
  }

  if (!usergroupId) {
    if (isStaging) {
      console.warn(
        '[updateOnCallUserGroup] Staging: SLACK_USERGROUP_ID_STAGING is not set and auto-create failed (check usergroups:write scope). Skipping user group update. ' +
        'Create a user group in Slack with handle triage-oncall-staging, or set SLACK_USERGROUP_ID_STAGING in .env.local. See ENVIRONMENT_COMMANDS.md (On-call user group).'
      );
    } else {
      console.warn('[updateOnCallUserGroup] SLACK_USERGROUP_ID is missing. Skipping update.');
    }
    return;
  }
  try {
    const usersParam = Array.isArray(userIdsArray) ? userIdsArray.join(',') : '';
    await slackClient.usergroups.users.update({
      usergroup: usergroupId,
      users: usersParam
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
