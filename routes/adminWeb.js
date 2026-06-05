/**
 * Web admin routes (issue #1 foundation; expanded when #1 merges).
 * Protected by adminWebAuth (Slack OAuth or WEB_ADMIN_SECRET).
 */
const express = require('express');
const { requireAdminWebAuth } = require('../middleware/adminWebAuth');
const { isSlackOAuthConfigured } = require('../lib/slackOAuthConfig');
const { renderAdminShell } = require('../lib/adminWebShell');

const router = express.Router();

router.use(requireAdminWebAuth);

router.get('/', (req, res) => {
  const user = req.slackUser;
  const authMode = isSlackOAuthConfigured() ? 'Slack OAuth (with secret fallback)' : 'WEB_ADMIN_SECRET';
  const contentHtml = `
    <section class="t1-section">
      <h2>Dashboard</h2>
      <p class="t1-meta">
        Full rotation management (schedules, participant lists, overrides) lands with
        <a class="t1-link" href="https://github.com/t1p1/triage-bot/issues/1">issue #1</a>.
      </p>
      <p class="t1-meta">Slack user ID: <code>${user?.slackUserId || 'unknown'}</code></p>
    </section>`;

  res.type('html').send(renderAdminShell({
    pageTitle: 'Triage Admin',
    heading: 'Rotation administration',
    contentHtml,
    user,
    authMode,
    showSignOut: isSlackOAuthConfigured(),
  }));
});

router.get('/api/rotation-state', (req, res) => {
  res.json({
    status: 'ok',
    authenticatedAs: req.slackUser?.slackUserId || null,
    message: 'Rotation state API expands when issue #1 merges',
  });
});

module.exports = router;
