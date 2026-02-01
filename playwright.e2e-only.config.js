// @ts-check
// E2E-only config: single project so discovery finds spec files. Use for: npm run test:e2e.

const path = require('path');

const authDir = path.join(__dirname, 'tests', 'e2e', '.auth');
const storageStatePath = path.join(authDir, 'storageState.json');
const testDir = path.join(__dirname, 'tests', 'e2e');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list'], ['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.SLACK_WORKSPACE_URL || 'https://app.slack.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: storageStatePath,
  },
  timeout: 30000,
  expect: { timeout: 15000 },
  // Match spec files under testDir; regex matches absolute path so must match filename part
  testMatch: /\.spec\.(js|ts)$/,
  testIgnore: [],
  // Ensure e2e specs are discovered even if under ignored dirs (e.g. tests/e2e/.auth is ignored)
  respectGitIgnore: false,
  projects: [
    {
      name: 'slack-e2e',
      testDir,
      testMatch: /\.spec\.(js|ts)$/,
      use: {
        storageState: storageStatePath,
      },
    },
  ],
};

module.exports = config;
