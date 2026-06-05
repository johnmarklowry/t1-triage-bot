/**
 * Shared Team One admin web shell (Monorail amg-shell pattern).
 * Tokens and layout match rfi-accelerator / t1-crag-rfi internal apps.
 */

const APP_NAME = 'Triage Bot';
const APP_SUBTITLE = 'Rotation management';

function renderNav(navItems = []) {
  if (!navItems.length) return '';
  const links = navItems
    .map(
      (item) => `<a class="t1-nav__link${item.active ? ' t1-nav__link--active' : ''}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`,
    )
    .join('');
  return `<nav class="t1-sidebar__nav" aria-label="Section navigation">${links}</nav>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSignOut(showSignOut) {
  if (!showSignOut) return '';
  return `<form method="post" action="/auth/logout" class="t1-inline-form">
    <button type="submit" class="t1-btn t1-btn--secondary">Sign out</button>
  </form>`;
}

/**
 * Wrap admin page content in the Team One shell.
 * @param {object} options
 * @param {string} options.pageTitle
 * @param {string} options.heading
 * @param {string} options.contentHtml
 * @param {{ name?: string, slackUserId?: string } | null} [options.user]
 * @param {string} [options.authMode]
 * @param {boolean} [options.showSignOut]
 * @param {string} [options.subtitle]
 * @param {string} [options.eyebrow]
 * @param {Array<{href:string,label:string,active?:boolean}>} [options.navItems]
 */
function renderAdminShell({
  pageTitle,
  heading,
  contentHtml,
  user = null,
  authMode = '',
  showSignOut = false,
  subtitle = APP_SUBTITLE,
  eyebrow = APP_NAME,
  navItems = [],
}) {
  const userLabel = user?.name || user?.slackUserId || 'unknown';
  const authMeta = authMode ? `<p class="t1-sidebar__meta">Auth: ${escapeHtml(authMode)}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)} — Team One</title>
  <link rel="stylesheet" href="/admin/static/t1-shell.css" />
</head>
<body class="t1-shell">
  <div class="t1-layout">
    <aside class="t1-sidebar" aria-label="Team One navigation">
      <div class="t1-sidebar__brand">
        <div class="t1-sidebar__mark">
          <span class="t1-sidebar__pixel" aria-hidden="true">T1</span>
          <h1 class="t1-sidebar__title">Team One</h1>
        </div>
        <p class="t1-sidebar__subtitle">${escapeHtml(subtitle)}</p>
      </div>
      ${renderNav(navItems)}
      <div class="t1-sidebar__footer">
        ${authMeta}
        <p class="t1-sidebar__meta" title="${escapeHtml(userLabel)}">Signed in as ${escapeHtml(userLabel)}</p>
        ${renderSignOut(showSignOut)}
      </div>
    </aside>
    <main class="t1-main">
      <header class="t1-main__header">
        <p class="t1-main__eyebrow">${escapeHtml(eyebrow)}</p>
        <h2 class="t1-main__heading">${escapeHtml(heading)}</h2>
      </header>
      <div class="t1-main__content">
        ${contentHtml}
      </div>
    </main>
  </div>
</body>
</html>`;
}

module.exports = {
  APP_NAME,
  APP_SUBTITLE,
  escapeHtml,
  renderAdminShell,
};
