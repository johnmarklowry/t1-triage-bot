/**
 * Authenticated Slack session for participant web routes (issue #4).
 */
const { isSlackOAuthConfigured } = require('../lib/slackOAuthConfig');
const { readSessionFromRequest, validateCsrfToken } = require('../services/slackOAuthSession');

function acceptsHtml(req) {
  const accept = req.get('accept') || '';
  return accept.includes('text/html') || req.path === '/dashboard';
}

function requireSlackSession(req, res, next) {
  if (!isSlackOAuthConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Slack OAuth is not configured',
      });
    }
    console.warn('[webSession] OAuth not configured; allowing anonymous access in non-production');
    req.slackUser = { slackUserId: 'U_DEV', name: 'Dev User' };
    return next();
  }

  const sessionUser = readSessionFromRequest(req);
  if (!sessionUser) {
    if (acceptsHtml(req)) {
      const returnTo = encodeURIComponent(req.originalUrl || '/dashboard');
      return res.redirect(`/auth/slack?returnTo=${returnTo}`);
    }
    return res.status(401).json({
      status: 'unauthorized',
      message: 'Sign in with Slack required',
    });
  }

  req.slackUser = sessionUser;
  return next();
}

function requireCsrfToken(req, res, next) {
  const token = req.body?._csrf || req.get('x-csrf-token');
  if (!token || !req.slackUser?.slackUserId) {
    return res.status(403).json({ status: 'forbidden', message: 'Missing CSRF token' });
  }
  if (!validateCsrfToken(token, req.slackUser.slackUserId)) {
    return res.status(403).json({ status: 'forbidden', message: 'Invalid CSRF token' });
  }
  return next();
}

module.exports = {
  requireSlackSession,
  requireCsrfToken,
};
