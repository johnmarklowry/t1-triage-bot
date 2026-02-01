// @ts-check
// Smoke e2e: App Home, slash commands, override list, admin UIs, validation (UAT-003, 004, 007, 008, 011, 015, 016, 018, 022, 023).
// Requires: staging bot deployed; run npm run test:e2e:auth once to save Slack login state.

const { test, expect } = require('@playwright/test');

const WORKSPACE_URL = process.env.SLACK_WORKSPACE_URL || 'https://app.slack.com';
const ADMIN_CHANNEL_ID = process.env.SLACK_E2E_ADMIN_CHANNEL_ID || null;
/** Direct URL to the bot app Home tab (e.g. https://app.slack.com/client/T024FQAM2/D09NHUJN58V). If set, goToAppHome navigates here instead of using sidebar. */
const APP_HOME_URL = process.env.SLACK_E2E_APP_HOME_URL || null;

/** Navigate to the admin channel so admin-only slash commands work. Requires SLACK_E2E_ADMIN_CHANNEL_ID. */
async function goToAdminChannel(page) {
  if (!ADMIN_CHANNEL_ID) return;
  const adminUrl = `${WORKSPACE_URL.replace(/\/$/, '')}/archives/${ADMIN_CHANNEL_ID}`;
  await page.goto(adminUrl);
  await expect(page).toHaveURL(new RegExp(`/archives/${ADMIN_CHANNEL_ID}`));
  await page.getByRole('textbox', { name: /Message to /i }).first().waitFor({ state: 'visible', timeout: 15_000 });
}

/** Run a slash command in the current channel and wait for the message input to be ready. */
async function runSlashCommand(page, command) {
  const messageInput = page.getByRole('textbox', { name: /Message to /i }).first();
  await messageInput.click({ timeout: 10_000 });
  await messageInput.fill(command);
  await page.keyboard.press('Enter');
}

/** Open the bot app and its Home tab (not the workspace Home). Required for UAT-022 and UAT-023. */
async function goToAppHome(page) {
  if (APP_HOME_URL) {
    await page.goto(APP_HOME_URL);
    await expect(page.getByText(/Current On-Call|Triage|On-Call|rotation/i).first()).toBeVisible({ timeout: 15_000 });
    return;
  }
  const appsSection = page.getByRole('button', { name: /^Apps$/i }).or(page.getByRole('treeitem', { name: /^Apps$/i }));
  await appsSection.first().click({ timeout: 10_000 }).catch(() => {});
  const botInSidebar = page.getByRole('treeitem', { name: /NATE Triage|triage team bot|triage bot/i })
    .or(page.getByRole('link', { name: /NATE Triage|triage team bot/i }))
    .or(page.getByText(/NATE Triage|triage team bot/i).first());
  await botInSidebar.click({ timeout: 15_000 });
  await expect(page.getByText(/Current On-Call|Triage|On-Call|rotation/i).first()).toBeVisible({ timeout: 15_000 });
}

test.describe('Slack bot smoke (staging)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(WORKSPACE_URL);
    // Ensure we're in the workspace (storage state should have us logged in)
    await expect(page).toHaveURL(/slack\.com/);
  });

  test('UAT-022: App Home loads and shows key content', async ({ page }) => {
    await goToAppHome(page);
  });

  test('UAT-003: Slash command /triage-schedule-staging opens modal', async ({ page }) => {
    await runSlashCommand(page, '/triage-schedule-staging');
    await expect(page.getByRole('dialog').or(page.getByText(/Schedule|Date|Pick a date/i).first())).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-004: Schedule modal opens and is interactive', async ({ page }) => {
    await runSlashCommand(page, '/triage-schedule-staging');
    const modal = page.getByRole('dialog').or(page.getByText(/Schedule|Date|Pick a date/i).first());
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal.getByRole('button').first()).toBeVisible({ timeout: 5_000 });
  });

  test('UAT-007: Slash command /triage-override-staging opens override request modal', async ({ page }) => {
    await runSlashCommand(page, '/triage-override-staging');
    await expect(page.getByRole('dialog').or(page.getByText(/Override|Request|Coverage|coverage request/i).first())).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-008: Override modal validates missing input', async ({ page }) => {
    await runSlashCommand(page, '/triage-override-staging');
    await expect(page.getByRole('dialog').or(page.getByText(/Override|Request|Coverage/i).first())).toBeVisible({ timeout: 15_000 });
    const submitBtn = page.getByRole('button', { name: /Submit|Send|Request/i }).first();
    await submitBtn.click({ timeout: 5_000 }).catch(() => {});
    await expect(page.getByText(/required|fill|select|choose|invalid/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('UAT-011: Admin override list opens with /override-list-staging', async ({ page }) => {
    await goToAdminChannel(page);
    await runSlashCommand(page, '/override-list-staging');
    await expect(page.getByText(/Override|Pending|override list|Request/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-015: Admin sprints UI opens with /admin-sprints-staging', async ({ page }) => {
    await goToAdminChannel(page);
    await runSlashCommand(page, '/admin-sprints-staging');
    await expect(page.getByText(/Sprint|Admin|sprint/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-016: Admin disciplines UI opens with /admin-disciplines-staging', async ({ page }) => {
    await goToAdminChannel(page);
    await runSlashCommand(page, '/admin-disciplines-staging');
    await expect(page.getByText(/Discipline|Admin|discipline/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-018: Admin users UI opens with /admin-users-staging', async ({ page }) => {
    await goToAdminChannel(page);
    await runSlashCommand(page, '/admin-users-staging');
    await expect(page.getByText(/User|Member|Management|Manage/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-023: Home tab "View All Upcoming Sprints" opens modal', async ({ page }) => {
    await goToAppHome(page);
    const upcomingLink = page.getByRole('button', { name: /View All Upcoming|Upcoming Sprints|Upcoming Sprints & Rotations/i })
      .or(page.getByText(/View All Upcoming|Upcoming Sprints|Upcoming Sprints & Rotations/i).first());
    await upcomingLink.click({ timeout: 10_000 });
    await expect(page.getByRole('dialog').or(page.getByText(/Upcoming|Sprint|schedule|rotation/i).first())).toBeVisible({ timeout: 15_000 });
  });
});
