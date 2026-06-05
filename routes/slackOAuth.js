/**
 * Slack OAuth sign-in routes (issue #4).
 *
 * - GET  /auth/slack — redirect to Slack authorize
 * - GET  /auth/slack/callback — exchange code, set session cookie
 * - POST /auth/logout — clear session
 */
const express = require('express');
const { isSlackOAuthConfigured } = require('../lib/slackOAuthConfig');
const {
  buildAuthorizeUrl,
  generateOAuthState,
  generateNonce,
  exchangeAuthorizationCode,
  slackUserFromTokenResponse,
} = require('../services/slackOAuthClient');
const {
  createSessionCookie,
  clearSessionCookie,
  createOAuthStateCookie,
  clearOAuthStateCookie,
  readOAuthStateFromRequest,
} = require('../services/slackOAuthSession');

const router = express.Router();

function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/admin';
  }
  return value;
}

router.get('/slack', (req, res) => {
  if (!isSlackOAuthConfigured()) {
    return res.status(503).send('Slack OAuth is not configured');
  }

  const returnTo = safeReturnTo(req.query.returnTo);
  const state = generateOAuthState();
  const nonce = generateNonce();
  const authorizeUrl = buildAuthorizeUrl({ state, nonce, returnTo });

  res.setHeader('Set-Cookie', createOAuthStateCookie(state, nonce, returnTo));
  return res.redirect(authorizeUrl);
});

router.get('/slack/callback', async (req, res) => {
  if (!isSlackOAuthConfigured()) {
    return res.status(503).send('Slack OAuth is not configured');
  }

  const { code, state, error } = req.query;
  if (error) {
    return res.status(400).send(`Slack sign-in failed: ${error}`);
  }
  if (!code || !state) {
    return res.status(400).send('Missing OAuth code or state');
  }

  const oauthState = readOAuthStateFromRequest(req);
  if (!oauthState || oauthState.state !== state) {
    return res.status(400).send('Invalid or expired OAuth state');
  }

  try {
    const tokenResponse = await exchangeAuthorizationCode(code);
    const slackUser = slackUserFromTokenResponse(tokenResponse);

    if (tokenResponse.id_token) {
      const { decodeIdToken } = require('../services/slackOAuthClient');
      const claims = decodeIdToken(tokenResponse.id_token);
      if (claims.nonce && claims.nonce !== oauthState.nonce) {
        return res.status(400).send('OAuth nonce mismatch');
      }
    }

    res.setHeader('Set-Cookie', [
      createSessionCookie(slackUser),
      clearOAuthStateCookie(),
    ]);
    return res.redirect(safeReturnTo(oauthState.returnTo));
  } catch (err) {
    console.error('[slackOAuth] callback failed:', err);
    return res.status(500).send('Slack sign-in failed');
  }
});

router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.redirect('/admin');
});

module.exports = router;
