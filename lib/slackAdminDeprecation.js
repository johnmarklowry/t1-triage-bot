/**
 * Deprecate Slack-side rotation management when web admin is available (issue #2).
 */
const { isSlackOAuthConfigured } = require('./slackOAuthConfig');

function isWebAdminAvailable() {
  const secret = process.env.WEB_ADMIN_SECRET?.trim();
  return isSlackOAuthConfigured() || !!secret;
}

function isSlackAdminManagementDeprecated() {
  const flag = process.env.DEPRECATE_SLACK_ADMIN_COMMANDS?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  return isWebAdminAvailable();
}

function isSlackOverrideRequestDeprecated() {
  if (!isSlackAdminManagementDeprecated()) return false;
  return isSlackOAuthConfigured();
}

function getPublicAppBaseUrl() {
  const base = process.env.PUBLIC_APP_URL?.trim() || process.env.WEB_ADMIN_BASE_URL?.trim() || '';
  return base.replace(/\/$/, '');
}

function getWebAdminUrl(path = '/admin') {
  const base = getPublicAppBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

function buildDeprecatedAdminMessage(options = {}) {
  const path = options.path || '/admin';
  const surface = options.surface || 'admin commands';
  const url = getWebAdminUrl(path);
  const base = getPublicAppBaseUrl();
  const link = base ? `<${url}|Open the web admin UI>` : 'the web admin UI (ask your triage admin for the URL)';

  return (
    `:information_source: *Slack ${surface} are deprecated.* ` +
    `Manage rotations, participants, sprints, and overrides in the web UI instead — ${link}.\n\n` +
    `_Slack still sends rotation notifications and updates channel topic/on-call group. ` +
    'Set `DEPRECATE_SLACK_ADMIN_COMMANDS=false` to temporarily re-enable Slack admin tools during the grace period._'
  );
}

function buildDeprecatedOverrideRequestMessage() {
  const url = getWebAdminUrl('/dashboard');
  const base = getPublicAppBaseUrl();
  const link = base
    ? `<${url}|Open your schedule dashboard>`
    : 'the participant dashboard (sign in with Slack from your triage bot URL)';

  return (
    ':information_source: *Coverage requests via Slack are deprecated.* ' +
    `Submit override requests from ${link} instead.\n\n` +
    '_Use `/triage-schedule` or App Home to check who is on call._'
  );
}

async function postDeprecatedEphemeral(client, { channel, user, text }) {
  await client.chat.postEphemeral({ channel, user, text });
}

async function guardDeprecatedAdminCommand({ client, command, logger, surface, path }) {
  if (!isSlackAdminManagementDeprecated()) return false;
  try {
    await postDeprecatedEphemeral(client, {
      channel: command.channel_id,
      user: command.user_id,
      text: buildDeprecatedAdminMessage({ surface, path }),
    });
  } catch (error) {
    logger?.error?.('[slackAdminDeprecation] admin guard failed:', error);
  }
  return true;
}

async function guardDeprecatedOverrideRequest({ client, command, logger }) {
  if (!isSlackOverrideRequestDeprecated()) return false;
  try {
    await postDeprecatedEphemeral(client, {
      channel: command.channel_id,
      user: command.user_id,
      text: buildDeprecatedOverrideRequestMessage(),
    });
  } catch (error) {
    logger?.error?.('[slackAdminDeprecation] override guard failed:', error);
  }
  return true;
}

async function guardDeprecatedOverrideShortcut({ client, shortcut, logger }) {
  if (!isSlackOverrideRequestDeprecated()) return false;
  const channel = shortcut.channel?.id;
  const user = shortcut.user?.id;
  if (!channel || !user) return true;
  try {
    await postDeprecatedEphemeral(client, {
      channel,
      user,
      text: buildDeprecatedOverrideRequestMessage(),
    });
  } catch (error) {
    logger?.error?.('[slackAdminDeprecation] override shortcut guard failed:', error);
  }
  return true;
}

function buildDeprecatedAdminHubModalView() {
  const url = getWebAdminUrl('/admin');
  const base = getPublicAppBaseUrl();
  const linkLine = base
    ? `<${url}|Open web admin>`
    : 'Configure `PUBLIC_APP_URL` so admins get a clickable link to the web UI.';

  return {
    type: 'modal',
    callback_id: 'admin_hub_modal',
    title: { type: 'plain_text', text: 'Admin' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Web admin' } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: buildDeprecatedAdminMessage({ surface: 'App Home admin tools', path: '/admin' }),
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: linkLine },
      },
    ],
  };
}

module.exports = {
  isWebAdminAvailable,
  isSlackAdminManagementDeprecated,
  isSlackOverrideRequestDeprecated,
  getPublicAppBaseUrl,
  getWebAdminUrl,
  buildDeprecatedAdminMessage,
  buildDeprecatedOverrideRequestMessage,
  guardDeprecatedAdminCommand,
  guardDeprecatedOverrideRequest,
  guardDeprecatedOverrideShortcut,
  buildDeprecatedAdminHubModalView,
};
