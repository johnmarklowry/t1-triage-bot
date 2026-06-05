/**
 * Web admin routes (issue #1 foundation; expanded when #1 merges).
 * Protected by adminWebAuth (Slack OAuth or WEB_ADMIN_SECRET).
 */
const express = require('express');
const { requireAdminWebAuth } = require('../middleware/adminWebAuth');
const { isSlackOAuthConfigured } = require('../lib/slackOAuthConfig');

const router = express.Router();

router.use(requireAdminWebAuth);

router.get('/', (req, res) => {
  const user = req.slackUser;
  const authMode = isSlackOAuthConfigured() ? 'Slack OAuth (with secret fallback)' : 'WEB_ADMIN_SECRET';
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Triage Admin</title></head>
<body>
  <h1>Triage rotation admin</h1>
  <p>Authenticated as <strong>${user?.name || user?.slackUserId || 'unknown'}</strong> (${user?.slackUserId})</p>
  <p>Auth mode: ${authMode}</p>
  <p>Full management UI lands with <a href="https://github.com/t1p1/triage-bot/issues/1">issue #1</a>.</p>
  ${isSlackOAuthConfigured() ? '<form method="post" action="/auth/logout"><button type="submit">Sign out</button></form>' : ''}
</body>
</html>`);
});

router.get('/api/rotation-state', (req, res) => {
  res.json({
    status: 'ok',
    authenticatedAs: req.slackUser?.slackUserId || null,
    message: 'Rotation state API expands when issue #1 merges',
  });
});

module.exports = router;
