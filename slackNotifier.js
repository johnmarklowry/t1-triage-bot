/********************************
 * slackNotifier.js
 ********************************/
const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const config = require('./config');
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const STAGING_USERGROUP_HANDLE = 'triage-oncall-staging';
const STAGING_USERGROUP_NAME = 'Triage On-Call (Staging)';
const TOPIC_DEDUPE_TTL_MS = 10 * 60 * 1000;
const NON_TRANSIENT_TOPIC_READ_ERRORS = new Set([
  'missing_scope',
  'not_in_channel',
  'channel_not_found',
  'invalid_auth'
]);
let _stagingUserGroupId = null;
let _stagingUserGroupIdLogged = false;
const recentTopicAttemptsByChannel = new Map();
const notifiedTopicReadFailures = new Set();

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
    return false;
  }
  try {
    await slackClient.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `[ERROR] ${text}`
    });
    return true;
  } catch (err) {
    console.error('Failed to notify admins:', err);
    return false;
  }
}

/**
 * Reads normalized topic text from a conversations.info channel payload.
 * @param {{ topic?: string | { value?: string } }} [channel]
 */
function getChannelTopicValue(channel) {
  const t = channel?.topic;
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (typeof t === 'object' && 'value' in t && typeof t.value === 'string') return t.value;
  return '';
}

function getSlackErrorCode(err) {
  return err?.data?.error || err?.code || err?.message || 'unknown_error';
}

function getTopicHash(topic) {
  return crypto.createHash('sha256').update(topic).digest('hex').slice(0, 12);
}

function hasRecentTopicAttempt(channelId, topicHash) {
  const recent = recentTopicAttemptsByChannel.get(channelId);
  if (!recent) return false;
  if (recent.expiresAt <= Date.now()) {
    recentTopicAttemptsByChannel.delete(channelId);
    return false;
  }
  return recent.topicHash === topicHash;
}

function rememberTopicAttempt(channelId, topicHash) {
  recentTopicAttemptsByChannel.set(channelId, {
    topicHash,
    expiresAt: Date.now() + TOPIC_DEDUPE_TTL_MS
  });
}

async function notifyTopicReadFailureOnce(channelId, readFailureCode) {
  const key = `${channelId}:${readFailureCode}`;
  if (notifiedTopicReadFailures.has(key)) return;
  const notified = await notifyAdmins(
    `Cannot verify Slack channel topic for ${channelId} (${readFailureCode}); skipped setTopic to avoid duplicate channel-topic system messages.`
  );
  if (notified) {
    notifiedTopicReadFailures.add(key);
  }
}

/**
 * Updates the channel topic for the bug triage channel.
 * The topic is set to:
 * "Bug Link Only - keep conversations in threads.
 *  Triage Team: {New Triage Members}"
 *
 * Skips conversations.setTopic when the channel already has the same topic (avoids duplicate Slack system messages when multiple jobs call this).
 */
async function updateChannelTopic(userIdsArray) {
  const channelId = process.env.BUG_TRIAGE_CHANNEL_ID;
  if (!channelId) {
    console.warn('[updateChannelTopic] BUG_TRIAGE_CHANNEL_ID is not set; skipping.');
    return;
  }

  try {
    // Format the user IDs as @mentions
    const mentionList = userIdsArray.map(id => `<@${id}>`).join(', ');

    const newTopic =
      `Bug Link Only - keep conversations in threads.\n` +
      `Triage Team: ${mentionList}`;
    const desiredTopicHash = getTopicHash(newTopic);

    try {
      const infoRes = await slackClient.conversations.info({ channel: channelId });
      const current = getChannelTopicValue(infoRes.channel);
      if (current === newTopic) {
        console.log(`[updateChannelTopic] Unchanged; skipping setTopic for channel ${channelId}.`);
        return;
      }
    } catch (infoErr) {
      const readFailureCode = getSlackErrorCode(infoErr);
      const logData = { channelId, desiredTopicHash, readFailureCode };
      if (NON_TRANSIENT_TOPIC_READ_ERRORS.has(readFailureCode)) {
        console.warn('[updateChannelTopic] conversations.info failed; skipping setTopic for non-transient read failure:', logData);
        await notifyTopicReadFailureOnce(channelId, readFailureCode);
        return;
      }
      if (hasRecentTopicAttempt(channelId, desiredTopicHash)) {
        console.warn('[updateChannelTopic] conversations.info failed; skipping recent duplicate setTopic attempt:', logData);
        return;
      }
      console.warn('[updateChannelTopic] conversations.info failed; proceeding with setTopic:', logData);
    }

    await slackClient.conversations.setTopic({
      channel: channelId,
      topic: newTopic
    });
    rememberTopicAttempt(channelId, desiredTopicHash);
    console.log(`[updateChannelTopic] Channel ${channelId} topic updated.`);
  } catch (err) {
    console.error('[updateChannelTopic] Error:', err);
    await notifyAdmins(`Error updating channel topic for ${channelId}: ${err.message}`);
  }
}

/**
 * Updates the channel topic for releases channel (optional).
 */
async function updateReleasesChannelTopic(userIdsArray) {
  if (!process.env.RELEASES_CHANNEL_ID) {
    return;
  }

  try {
    const uniqueIds = [...new Set((Array.isArray(userIdsArray) ? userIdsArray : []).filter(Boolean))];
    const mentionList = uniqueIds.map(id => `<@${id}>`).join(', ');
    const newTopic =
      `Release ownership for upcoming sprint.\n` +
      `Release Team: ${mentionList || '(none configured)'}`;

    await slackClient.conversations.setTopic({
      channel: process.env.RELEASES_CHANNEL_ID,
      topic: newTopic
    });
    console.log(`[updateReleasesChannelTopic] Channel ${process.env.RELEASES_CHANNEL_ID} topic updated.`);
  } catch (err) {
    console.error('[updateReleasesChannelTopic] Error:', err);
    await notifyAdmins(`Error updating releases channel topic for ${process.env.RELEASES_CHANNEL_ID}: ${err.message}`);
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
  // #region agent log
  const userIdsLength = Array.isArray(userIdsArray) ? userIdsArray.length : 0;
  fetch('http://127.0.0.1:7244/ingest/531a11ed-2f40-4efd-8034-868687a93e81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3d438f'},body:JSON.stringify({sessionId:'3d438f',location:'slackNotifier.js:updateOnCallUserGroup',message:'updateOnCallUserGroup entry',data:{userIdsLength},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/531a11ed-2f40-4efd-8034-868687a93e81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3d438f'},body:JSON.stringify({sessionId:'3d438f',location:'slackNotifier.js:updateOnCallUserGroup',message:'updateOnCallUserGroup skipped',data:{reason:'no_usergroup_id'},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/531a11ed-2f40-4efd-8034-868687a93e81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3d438f'},body:JSON.stringify({sessionId:'3d438f',location:'slackNotifier.js:updateOnCallUserGroup',message:'updateOnCallUserGroup success',data:{userIdsLength},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.log('[updateOnCallUserGroup] User group updated successfully.');
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/531a11ed-2f40-4efd-8034-868687a93e81',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3d438f'},body:JSON.stringify({sessionId:'3d438f',location:'slackNotifier.js:updateOnCallUserGroup',message:'updateOnCallUserGroup failed',data:{error:err?.message||String(err)},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    console.error('Failed to update user group:', err);
    await notifyAdmins(`Error updating Slack user group: ${err.message}`);
  }
}

/**
 * Updates the Slack user group for release-team members.
 * In staging, uses SLACK_RELEASE_TEAM_USERGROUP_ID_STAGING and never touches production group.
 * Empty input preserves existing membership (skip update).
 */
async function updateReleaseTeamUserGroup(userIdsArray) {
  const deduped = [...new Set((Array.isArray(userIdsArray) ? userIdsArray : []).filter(Boolean))];
  if (deduped.length === 0) {
    console.warn('[updateReleaseTeamUserGroup] Empty member set; skipping Slack update to preserve existing release-team group membership.');
    return;
  }

  const isStaging = config.isStaging;
  const usergroupId = isStaging
    ? process.env.SLACK_RELEASE_TEAM_USERGROUP_ID_STAGING
    : process.env.SLACK_RELEASE_TEAM_USERGROUP_ID;

  if (!usergroupId) {
    if (isStaging) {
      console.warn('[updateReleaseTeamUserGroup] Staging release-team group ID is missing (SLACK_RELEASE_TEAM_USERGROUP_ID_STAGING). Skipping update.');
    } else {
      console.warn('[updateReleaseTeamUserGroup] SLACK_RELEASE_TEAM_USERGROUP_ID is missing. Skipping update.');
    }
    return;
  }

  try {
    await slackClient.usergroups.users.update({
      usergroup: usergroupId,
      users: deduped.join(',')
    });
    console.log('[updateReleaseTeamUserGroup] Release team user group updated successfully.');
  } catch (err) {
    console.error('[updateReleaseTeamUserGroup] Failed to update user group:', err);
    await notifyAdmins(`Error updating release team Slack user group: ${err.message}`);
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
  updateReleaseTeamUserGroup,
  updateChannelTopic,
  updateReleasesChannelTopic,
  notifyRotationChanges
};
