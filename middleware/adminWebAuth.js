/**
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

  const authHeader = req.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : null;
  const token = bearer || queryToken;

  if (!token || token !== secret) {
    return res.status(401).json({
      status: 'unauthorized',
      message: 'Invalid or missing admin credentials',
    });
  }

  return next();
}

module.exports = { requireAdminWebAuth };
