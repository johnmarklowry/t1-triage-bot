/**
 * Participant dashboard (issue #4).
 *
 * - GET  /dashboard — personalized schedule view
 * - GET  /dashboard/api/state — JSON snapshot
 * - POST /dashboard/api/overrides/request — submit coverage override
 */
const express = require('express');
const { requireSlackSession, requireCsrfToken } = require('../middleware/webSessionAuth');
const { isSlackOAuthConfigured } = require('../lib/slackOAuthConfig');
const { renderAdminShell, escapeHtml } = require('../lib/adminWebShell');
const { createCsrfToken } = require('../services/slackOAuthSession');
const { buildUserDashboardSnapshot } = require('../services/userDashboardState');
const { createOverrideRequest } = require('../services/userWebOverrides');
const { ROLE_DISPLAY } = require('../services/userRotationView');

const router = express.Router();

function renderFlash(flash) {
  if (!flash?.message) return '';
  const type = flash.type === 'error' ? 'error' : 'ok';
  return `<div class="t1-flash t1-flash--${type}">${escapeHtml(flash.message)}</div>`;
}

function renderCurrentRoster(snapshot) {
  const rotation = snapshot.currentRotation;
  if (!rotation?.users?.length) {
    return '<p class="t1-meta">No active sprint roster loaded.</p>';
  }
  const rows = rotation.users
    .map((u) => {
      const you = u.slackId === snapshot.user.slackUserId ? ' (you)' : '';
      const role = ROLE_DISPLAY[u.role] || u.role;
      return `<tr><th>${escapeHtml(role)}</th><td>${escapeHtml(u.name)} <code>${escapeHtml(u.slackId)}</code>${escapeHtml(you)}</td></tr>`;
    })
    .join('');
  return `<table class="t1-table"><tbody>${rows}</tbody></table>`;
}

function renderUpcoming(shifts) {
  if (!shifts?.length) return '<p class="t1-meta">No upcoming shifts scheduled for you.</p>';
  return shifts
    .map(
      (s) => `<section class="t1-section">
      <h2>${escapeHtml(s.sprintName || 'Sprint')} · ${escapeHtml(s.daysUntil || '')}</h2>
      <p class="t1-meta">${escapeHtml(s.startDate)} → ${escapeHtml(s.endDate)} · ${escapeHtml(s.roleDisplay || s.role)}</p>
    </section>`,
    )
    .join('');
}

function renderOverrides(overrides) {
  const all = [...(overrides.pending || []), ...(overrides.approved || [])];
  if (!all.length) return '<p class="t1-meta">No override requests on your record.</p>';
  const rows = all
    .map((o) => {
      const status = o.approved ? 'Approved' : 'Pending';
      return `<tr>
        <td>Sprint #${escapeHtml(o.sprintIndex)}</td>
        <td>${escapeHtml(o.role)}</td>
        <td><code>${escapeHtml(o.newSlackId)}</code></td>
        <td>${escapeHtml(status)}</td>
      </tr>`;
    })
    .join('');
  return `<table class="t1-table">
    <thead><tr><th>Sprint</th><th>Role</th><th>Replacement</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderOverrideForm(snapshot, csrfToken) {
  if (!snapshot.user.inRotation) return '';

  const sprintOptions = (snapshot.overrideForm.eligibleSprints || [])
    .map(
      (s) => `<option value="${escapeHtml(s.sprintIndex)}">${escapeHtml(s.label)}</option>`,
    )
    .join('');
  const replacementOptions = (snapshot.overrideForm.replacements || [])
    .map((r) => `<option value="${escapeHtml(r.slackId)}">${escapeHtml(r.name)}</option>`)
    .join('');

  if (!sprintOptions || !replacementOptions) {
    return '<p class="t1-meta">No eligible sprints or replacements available for a coverage request right now.</p>';
  }

  return `<form method="post" action="/dashboard/api/overrides/request" class="t1-section">
    <h2>Request coverage override</h2>
    <p class="t1-meta">Ask a teammate to cover one of your scheduled sprints. Admins approve requests in Slack or the admin UI.</p>
    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
    <p>
      <label class="t1-meta">Sprint<br />
        <select name="sprintIndex" required>${sprintOptions}</select>
      </label>
    </p>
    <p>
      <label class="t1-meta">Replacement<br />
        <select name="replacementSlackId" required>${replacementOptions}</select>
      </label>
    </p>
    <button type="submit" class="t1-btn t1-btn--primary">Submit request</button>
  </form>`;
}

function renderEmptyState() {
  return `<section class="t1-section">
    <h2>Not on a rotation roster</h2>
    <p class="t1-meta">Your Slack account is signed in, but you are not listed on any discipline rotation. If you believe this is an error, contact a triage admin or ask in the admin channel.</p>
    <p class="t1-meta">You can still use Slack App Home and bot commands to view team schedules.</p>
  </section>`;
}

function renderDashboardPage(snapshot, options = {}) {
  const csrfToken = options.csrfToken || '';
  const flash = options.flash || null;
  const navItems = [
    { href: '/dashboard', label: 'My schedule', active: true },
  ];
  if (snapshot.isAdmin) {
    navItems.push({ href: '/admin', label: 'Admin', active: false });
  }

  let contentHtml = renderFlash(flash);

  if (!snapshot.user.inRotation) {
    contentHtml += renderEmptyState();
  } else {
    if (snapshot.onCallStatus) {
      contentHtml += `<section class="t1-section">
        <h2>You are on call now</h2>
        <p class="t1-meta"><strong>${escapeHtml(snapshot.onCallStatus.roleDisplay)}</strong> · ${escapeHtml(snapshot.onCallStatus.sprintName)} · ${escapeHtml(snapshot.onCallStatus.timeRemaining)}</p>
      </section>`;
    }

    contentHtml += `<section class="t1-section">
      <h2>Current team on call</h2>
      ${renderCurrentRoster(snapshot)}
    </section>`;

    contentHtml += `<section class="t1-section">
      <h2>Your upcoming shifts</h2>
      ${renderUpcoming(snapshot.upcomingShifts)}
    </section>`;

    contentHtml += `<section class="t1-section">
      <h2>Your overrides</h2>
      ${renderOverrides(snapshot.overrides)}
    </section>`;

    contentHtml += renderOverrideForm(snapshot, csrfToken);
  }

  return renderAdminShell({
    pageTitle: 'My schedule',
    heading: 'My rotation schedule',
    subtitle: 'Participant dashboard',
    eyebrow: 'Triage Bot',
    contentHtml,
    user: {
      name: options.userName || snapshot.user.slackUserId,
      slackUserId: snapshot.user.slackUserId,
    },
    showSignOut: isSlackOAuthConfigured(),
    navItems,
  });
}

async function redirectWithFlash(req, res, flash) {
  const qs = flash ? `?flash=${encodeURIComponent(flash.type)}&msg=${encodeURIComponent(flash.message)}` : '';
  res.redirect(303, `/dashboard${qs}`);
}

router.use(requireSlackSession);
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

router.get('/api/state', async (req, res) => {
  try {
    const snapshot = await buildUserDashboardSnapshot(req.slackUser.slackUserId);
    res.json({ status: 'ok', ...snapshot });
  } catch (error) {
    console.error('[dashboardWeb] state failed:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post('/api/overrides/request', requireCsrfToken, async (req, res) => {
  try {
    const result = await createOverrideRequest({
      requesterSlackId: req.slackUser.slackUserId,
      sprintIndex: req.body?.sprintIndex,
      replacementSlackId: req.body?.replacementSlackId,
    });
    const message = `Coverage request submitted for ${result.sprintLabel}`;
    if (req.is('json')) {
      return res.json({ status: 'ok', ...result });
    }
    await redirectWithFlash(req, res, { type: 'ok', message });
  } catch (error) {
    console.error('[dashboardWeb] override request failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (req.is('json')) {
      return res.status(400).json({ status: 'error', message });
    }
    await redirectWithFlash(req, res, { type: 'error', message });
  }
});

router.get('/', async (req, res) => {
  try {
    const snapshot = await buildUserDashboardSnapshot(req.slackUser.slackUserId);
    const csrfToken = createCsrfToken(req.slackUser.slackUserId);
    let flash = null;
    if (req.query.flash && req.query.msg) {
      flash = { type: String(req.query.flash), message: String(req.query.msg) };
    }
    res.type('html').send(renderDashboardPage(snapshot, {
      csrfToken,
      flash,
      userName: req.slackUser.name || req.slackUser.slackUserId,
    }));
  } catch (error) {
    console.error('[dashboardWeb] page failed:', error);
    res.status(500).type('html').send(`<pre>${escapeHtml(error.message)}</pre>`);
  }
});

module.exports = router;
