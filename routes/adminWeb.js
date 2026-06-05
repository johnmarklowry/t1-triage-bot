/**
 * Web management UI foundation (GitHub issue #1).
 *
 * - GET  /admin/api/rotation-state — JSON snapshot for admin clients
 * - GET  /admin — HTML dashboard
 * - POST /admin/api/participants — add member to discipline
 * - POST /admin/api/participants/:slackId/deactivate
 * - POST /admin/api/participants/:slackId/reactivate
 * - PUT  /admin/api/participants/:discipline/order — reorder active members
 */
const express = require('express');
const { requireAdminWebAuth } = require('../middleware/adminWebAuth');
const { buildAdminRotationSnapshot, ROLE_KEYS } = require('../services/adminWebRotationState');
const {
  addParticipant,
  deactivateParticipant,
  reactivateParticipant,
  reorderParticipants,
  isValidDiscipline,
} = require('../services/adminWebParticipants');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tokenQuery(req) {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  return token ? `?token=${encodeURIComponent(token)}` : '';
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

function renderParticipantLists(participantLists, tokenSuffix, flash) {
  if (!participantLists || !Object.keys(participantLists).length) {
    return '<p>No participant lists loaded.</p>';
  }

  const flashHtml = flash
    ? `<p class="flash ${escapeHtml(flash.type)}">${escapeHtml(flash.message)}</p>`
    : '';

  const sections = ROLE_KEYS.map((discipline) => {
    const members = participantLists[discipline] || [];
    const activeMembers = members.filter((m) => m.active !== false);
    const inactiveMembers = members.filter((m) => m.active === false);

    const activeRows = activeMembers.map((m, index) => {
      const upDisabled = index === 0 ? 'disabled' : '';
      const downDisabled = index === activeMembers.length - 1 ? 'disabled' : '';
      return `<tr>
        <td>${escapeHtml(m.name)} <code>${escapeHtml(m.slackId)}</code></td>
        <td class="actions">
          <form method="post" action="/admin/api/participants/${encodeURIComponent(m.slackId)}/move-up${tokenSuffix}" style="display:inline">
            <button type="submit" ${upDisabled}>↑</button>
          </form>
          <form method="post" action="/admin/api/participants/${encodeURIComponent(m.slackId)}/move-down${tokenSuffix}" style="display:inline">
            <button type="submit" ${downDisabled}>↓</button>
          </form>
          <form method="post" action="/admin/api/participants/${encodeURIComponent(m.slackId)}/deactivate${tokenSuffix}" style="display:inline">
            <button type="submit">Remove</button>
          </form>
        </td>
      </tr>`;
    }).join('');

    const inactiveRows = inactiveMembers.map((m) => `
      <tr class="inactive">
        <td>${escapeHtml(m.name)} <code>${escapeHtml(m.slackId)}</code> (inactive)</td>
        <td class="actions">
          <form method="post" action="/admin/api/participants/${encodeURIComponent(m.slackId)}/reactivate${tokenSuffix}">
            <button type="submit">Reactivate</button>
          </form>
        </td>
      </tr>`).join('');

    return `<section class="discipline">
      <h3>${escapeHtml(discipline)}</h3>
      <table>
        <thead><tr><th>Member</th><th>Actions</th></tr></thead>
        <tbody>${activeRows}${inactiveRows}</tbody>
      </table>
      <form method="post" action="/admin/api/participants${tokenSuffix}" class="add-form">
        <input type="hidden" name="discipline" value="${escapeHtml(discipline)}" />
        <label>Slack ID <input name="slackId" required placeholder="U01234567" /></label>
        <label>Name <input name="name" placeholder="Display name" /></label>
        <button type="submit">Add member</button>
      </form>
    </section>`;
  }).join('');

  return `${flashHtml}${sections}`;
}

function renderHtmlPage(snapshot, options = {}) {
  const sprint = snapshot.currentSprint;
  const sprintHeading = sprint
    ? `${escapeHtml(sprint.sprintName)} (index ${escapeHtml(sprint.sprintIndex)})`
    : 'No active sprint for today';
  const pending = snapshot.overrides?.pendingCount ?? 0;
  const tokenSuffix = options.tokenSuffix || '';
  const flash = options.flash || null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Triage rotation admin</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.4; max-width: 960px; }
    table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1.5rem; }
    th, td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; text-align: left; vertical-align: middle; }
    th { background: #f5f5f5; width: 8rem; }
    section { margin-bottom: 1.5rem; }
    .meta { color: #555; font-size: 0.9rem; }
    .discipline h3 { margin-bottom: 0.25rem; text-transform: capitalize; }
    .add-form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; margin-bottom: 1rem; }
    .add-form label { display: flex; flex-direction: column; font-size: 0.85rem; }
    .actions form { margin-right: 0.25rem; }
    tr.inactive td { color: #666; font-style: italic; }
    .flash { padding: 0.5rem 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .flash.ok { background: #e8f5e9; border: 1px solid #a5d6a7; }
    .flash.error { background: #ffebee; border: 1px solid #ef9a9a; }
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
    <h2>Participant lists</h2>
    <p class="meta">Add, remove (deactivate), or reorder rotation members per discipline.</p>
    ${renderParticipantLists(snapshot.participantLists, tokenSuffix, flash)}
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

function jsonError(res, status, message) {
  return res.status(status).json({ status: 'error', message });
}

async function redirectToDashboard(req, res, flash) {
  const tokenSuffix = tokenQuery(req);
  const snapshot = await buildAdminRotationSnapshot({ upcomingLimit: 5 });
  const qs = tokenSuffix ? `${tokenSuffix}&` : '?';
  if (flash) {
    res.redirect(303, `/admin${qs}flash=${encodeURIComponent(flash.type)}&msg=${encodeURIComponent(flash.message)}`);
    return;
  }
  res.redirect(303, `/admin${tokenSuffix}`);
}

router.use(requireAdminWebAuth);
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

router.get('/api/rotation-state', async (req, res) => {
  try {
    const snapshot = await buildAdminRotationSnapshot();
    res.json({ status: 'ok', ...snapshot });
  } catch (error) {
    console.error('[adminWeb] rotation-state failed:', error);
    jsonError(res, 500, error instanceof Error ? error.message : String(error));
  }
});

router.post('/api/participants', async (req, res) => {
  try {
    const discipline = req.body?.discipline;
    const slackId = req.body?.slackId;
    const name = req.body?.name;
    const result = await addParticipant({ discipline, slackId, name });
    if (req.is('json')) {
      return res.json({ status: 'ok', participant: result });
    }
    await redirectToDashboard(req, res, { type: 'ok', message: `Added ${result.name} to ${result.discipline}` });
  } catch (error) {
    console.error('[adminWeb] add participant failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (req.is('json')) return jsonError(res, 400, message);
    await redirectToDashboard(req, res, { type: 'error', message });
  }
});

router.post('/api/participants/:slackId/deactivate', async (req, res) => {
  try {
    const result = await deactivateParticipant({ slackId: req.params.slackId });
    const msg = result.reconciled
      ? `Removed ${result.slackId} from rotations (current sprint reconciled)`
      : `Removed ${result.slackId} from rotations`;
    if (req.is('json')) return res.json({ status: 'ok', ...result });
    await redirectToDashboard(req, res, { type: 'ok', message: msg });
  } catch (error) {
    console.error('[adminWeb] deactivate participant failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (req.is('json')) return jsonError(res, 400, message);
    await redirectToDashboard(req, res, { type: 'error', message });
  }
});

router.post('/api/participants/:slackId/reactivate', async (req, res) => {
  try {
    const result = await reactivateParticipant({ slackId: req.params.slackId });
    if (req.is('json')) return res.json({ status: 'ok', ...result });
    await redirectToDashboard(req, res, { type: 'ok', message: `Reactivated ${result.slackId}` });
  } catch (error) {
    console.error('[adminWeb] reactivate participant failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (req.is('json')) return jsonError(res, 400, message);
    await redirectToDashboard(req, res, { type: 'error', message });
  }
});

async function moveParticipant(req, res, direction) {
  try {
    const slackId = req.params.slackId;
    let discipline = req.body?.discipline || req.query?.discipline;

    const snapshot = await buildAdminRotationSnapshot({ upcomingLimit: 1 });
    if (!discipline) {
      for (const role of ROLE_KEYS) {
        const list = snapshot.participantLists?.[role] || [];
        if (list.some((m) => m.slackId === slackId && m.active !== false)) {
          discipline = role;
          break;
        }
      }
    }
    if (!discipline || !isValidDiscipline(discipline)) {
      throw new Error('Member not found in any discipline');
    }

    const members = (snapshot.participantLists?.[discipline] || []).filter((m) => m.active !== false);
    const ids = members.map((m) => m.slackId);
    const index = ids.indexOf(slackId);
    if (index < 0) throw new Error('Member not found in discipline');
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) {
      throw new Error('Cannot move member further in that direction');
    }
    [ids[index], ids[target]] = [ids[target], ids[index]];

    await reorderParticipants({ discipline, slackIds: ids });
    if (req.is('json')) return res.json({ status: 'ok', discipline, slackIds: ids });
    await redirectToDashboard(req, res, { type: 'ok', message: `Moved ${slackId} ${direction} in ${discipline}` });
  } catch (error) {
    console.error('[adminWeb] move participant failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (req.is('json')) return jsonError(res, 400, message);
    await redirectToDashboard(req, res, { type: 'error', message });
  }
}

router.post('/api/participants/:slackId/move-up', (req, res) => moveParticipant(req, res, 'up'));
router.post('/api/participants/:slackId/move-down', (req, res) => moveParticipant(req, res, 'down'));

router.put('/api/participants/:discipline/order', async (req, res) => {
  try {
    const discipline = req.params.discipline;
    const slackIds = req.body?.slackIds;
    const result = await reorderParticipants({ discipline, slackIds });
    res.json({ status: 'ok', ...result });
  } catch (error) {
    console.error('[adminWeb] reorder participants failed:', error);
    jsonError(res, 400, error instanceof Error ? error.message : String(error));
  }
});

router.get('/', async (req, res) => {
  try {
    const snapshot = await buildAdminRotationSnapshot({ upcomingLimit: 5 });
    const tokenSuffix = tokenQuery(req);
    let flash = null;
    if (req.query.flash && req.query.msg) {
      flash = {
        type: String(req.query.flash),
        message: String(req.query.msg),
      };
    }
    res.type('html').send(renderHtmlPage(snapshot, { tokenSuffix, flash }));
  } catch (error) {
    console.error('[adminWeb] dashboard failed:', error);
    res.status(500).type('html').send(`<pre>${escapeHtml(error.message)}</pre>`);
  }
});

module.exports = router;
