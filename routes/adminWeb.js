/**
 * Web management UI foundation (GitHub issue #1).
 *
 * - GET /admin/api/rotation-state — JSON snapshot for admin clients
 * - GET /admin — minimal HTML dashboard (MVP)
 */
const express = require('express');
const { requireAdminWebAuth } = require('../middleware/adminWebAuth');
const { buildAdminRotationSnapshot, ROLE_KEYS } = require('../services/adminWebRotationState');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRolesTable(roles) {
  if (!roles) return '<p>No role assignments loaded.</p>';
  const rows = ROLE_KEYS.map((role) => {
    const slackId = roles[role] || '—';
    return `<tr><th>${escapeHtml(role)}</th><td><code>${escapeHtml(slackId)}</code></td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Role</th><th>Slack user</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderUpcoming(upcomingSchedule) {
  if (!upcomingSchedule?.length) return '<p>No upcoming sprints.</p>';
  return upcomingSchedule
    .map((s) => {
      const label = `${escapeHtml(s.sprintName || 'Sprint')} (#${escapeHtml(s.sprintIndex)})`;
      const range = `${escapeHtml(s.startDate)} → ${escapeHtml(s.endDate)}`;
      return `<section><h3>${label}</h3><p>${range}</p>${renderRolesTable(s.roles)}</section>`;
    })
    .join('');
}

function renderHtmlPage(snapshot) {
  const sprint = snapshot.currentSprint;
  const sprintHeading = sprint
    ? `${escapeHtml(sprint.sprintName)} (index ${escapeHtml(sprint.sprintIndex)})`
    : 'No active sprint for today';
  const pending = snapshot.overrides?.pendingCount ?? 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Triage rotation admin</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.4; max-width: 960px; }
    table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1.5rem; }
    th, td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; text-align: left; }
    th { background: #f5f5f5; width: 8rem; }
    section { margin-bottom: 1.5rem; }
    .meta { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Rotation administration</h1>
  <p class="meta">Environment: <strong>${escapeHtml(snapshot.environment)}</strong> · Generated ${escapeHtml(snapshot.generatedAt)}</p>
  <section>
    <h2>Current sprint</h2>
    <p>${sprintHeading}</p>
    ${renderRolesTable(snapshot.currentRoles)}
  </section>
  <section>
    <h2>Pending coverage overrides</h2>
    <p>${pending} pending request(s). Use <code>/admin/api/rotation-state</code> for full detail.</p>
  </section>
  <section>
    <h2>Upcoming schedule</h2>
    ${renderUpcoming(snapshot.upcomingSchedule)}
  </section>
</body>
</html>`;
}

router.use(requireAdminWebAuth);

router.get('/api/rotation-state', async (req, res) => {
  try {
    const snapshot = await buildAdminRotationSnapshot();
    res.json({ status: 'ok', ...snapshot });
  } catch (error) {
    console.error('[adminWeb] rotation-state failed:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const snapshot = await buildAdminRotationSnapshot({ upcomingLimit: 5 });
    res.type('html').send(renderHtmlPage(snapshot));
  } catch (error) {
    console.error('[adminWeb] dashboard failed:', error);
    res.status(500).type('html').send(`<pre>${escapeHtml(error.message)}</pre>`);
  }
});

module.exports = router;
