/**
 * Slack OpenID Connect client helpers (issue #4).
 */
const crypto = require('crypto');
const { getSlackOAuthConfig } = require('../lib/slackOAuthConfig');

const SLACK_AUTHORIZE_URL = 'https://slack.com/openid/connect/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/openid.connect.token';

function buildAuthorizeUrl({ state, nonce, returnTo }) {
  const { clientId, redirectUri } = getSlackOAuthConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'openid profile email',
    client_id: clientId,
    state,
    nonce,
    redirect_uri: redirectUri,
  });
  if (returnTo) params.set('return_to', returnTo);
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

function generateOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

function generateNonce() {
  return crypto.randomBytes(24).toString('hex');
}

function decodeIdToken(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length < 2) throw new Error('Invalid id_token');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  return payload;
}

async function exchangeAuthorizationCode(code) {
  const { clientId, clientSecret, redirectUri } = getSlackOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || 'Slack OAuth token exchange failed');
  }
  return data;
}

function slackUserFromTokenResponse(tokenResponse) {
  const claims = decodeIdToken(tokenResponse.id_token);
  const slackUserId = claims['https://slack.com/user_id'] || claims.sub;
  if (!slackUserId) throw new Error('Slack user id missing from id_token');
  return {
    slackUserId,
    name: claims.name || null,
    email: claims.email || null,
  };
}

module.exports = {
  buildAuthorizeUrl,
  generateOAuthState,
  generateNonce,
  exchangeAuthorizationCode,
  slackUserFromTokenResponse,
  decodeIdToken,
};
