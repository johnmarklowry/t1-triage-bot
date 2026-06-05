/**
<<<<<<< HEAD
 * Protects web admin routes (issue #1) with Slack OAuth (issue #4) or WEB_ADMIN_SECRET fallback.
 */
const { isSlackOAuthConfigured } = require('../lib/slackOAuthConfig');
const { readSessionFromRequest } = require('../services/slackOAuthSession');

function acceptsHtml(req) {
  const accept = req.get('accept') || '';
  return accept.includes('text/html') || req.path === '/admin';
}

function hasValidSecret(req) {
  const secret = process.env.WEB_ADMIN_SECRET?.trim();
  if (!secret) return false;
=======
 * Protects web admin routes until Slack OAuth (issue #4) lands.
 * Uses WEB_ADMIN_SECRET via Authorization: Bearer or ?token= query param.
 */
function requireAdminWebAuth(req, res, next) {
  const secret = process.env.WEB_ADMIN_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Web admin is not configured (WEB_ADMIN_SECRET missing)',
      });
    }
    console.warn('[adminWeb] WEB_ADMIN_SECRET not set; allowing unauthenticated access in non-production');
    return next();
  }
>>>>>>> origin/main

  const authHeader = req.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : null;
  const token = bearer || queryToken;
<<<<<<< HEAD
  return token === secret;
}

function requireAdminWebAuth(req, res, next) {
  if (isSlackOAuthConfigured()) {
    const sessionUser = readSessionFromRequest(req);
    if (sessionUser) {
      req.slackUser = sessionUser;
      return next();
    }
    if (hasValidSecret(req)) {
      req.slackUser = { slackUserId: 'web-admin-secret', name: 'Shared secret admin' };
      return next();
    }

    if (acceptsHtml(req)) {
      const returnTo = encodeURIComponent(req.originalUrl || '/admin');
      return res.redirect(`/auth/slack?returnTo=${returnTo}`);
    }
    return res.status(401).json({
      status: 'unauthorized',
      message: 'Sign in with Slack or provide valid admin credentials',
    });
  }

  const secret = process.env.WEB_ADMIN_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Web admin is not configured (WEB_ADMIN_SECRET or Slack OAuth missing)',
      });
    }
    console.warn('[adminWeb] No auth configured; allowing unauthenticated access in non-production');
    return next();
  }

  if (!hasValidSecret(req)) {
=======

  if (!token || token !== secret) {
>>>>>>> origin/main
    return res.status(401).json({
      status: 'unauthorized',
      message: 'Invalid or missing admin credentials',
    });
  }

<<<<<<< HEAD
  req.slackUser = { slackUserId: 'web-admin-secret', name: 'Shared secret admin' };
  return next();
}

module.exports = { requireAdminWebAuth, hasValidSecret, acceptsHtml };
=======
  return next();
}

module.exports = { requireAdminWebAuth };
>>>>>>> origin/main
