/**
 * Slack OpenID Connect (Sign in with Slack) configuration (issue #4).
 */
function getSlackOAuthConfig() {
  const clientId = process.env.SLACK_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim() || '';
  const redirectUri = process.env.SLACK_OAUTH_REDIRECT_URI?.trim() || '';
  const sessionSecret = process.env.SESSION_SECRET?.trim() || '';

  return { clientId, clientSecret, redirectUri, sessionSecret };
}

function isSlackOAuthConfigured() {
  const { clientId, clientSecret, redirectUri, sessionSecret } = getSlackOAuthConfig();
  return !!(clientId && clientSecret && redirectUri && sessionSecret);
}

module.exports = { getSlackOAuthConfig, isSlackOAuthConfigured };
