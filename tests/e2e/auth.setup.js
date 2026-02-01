// @ts-check
// One-time auth: open Slack, log in manually (or via env), then save storage state.
// Run: npm run test:e2e:auth
// Then run: npm run test:e2e (uses saved state, no login).

const { test: setup } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const authDir = path.join(__dirname, '.auth');
const storageStatePath = path.join(authDir, 'storageState.json');

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(authDir, { recursive: true });

  const baseURL = process.env.SLACK_WORKSPACE_URL || 'https://app.slack.com';
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });

  // Wait for user to log in (manual or env credentials). After login Slack shows /client/ in the path.
  // Use a long timeout (2 min) so you can complete 2FA if needed.
  await page.waitForURL(/\/client\//, { timeout: 120_000 });

  await page.context().storageState({ path: storageStatePath });
});
