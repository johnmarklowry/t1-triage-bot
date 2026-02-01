// @ts-check
// Playwright config for Slack e2e (staging). Run against deployed staging bot.
// See tests/e2e/README.md for auth and run instructions.

const path = require('path');

const authDir = path.join(__dirname, 'tests', 'e2e', '.auth');
const storageStatePath = path.join(authDir, 'storageState.json');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: path.join(__dirname, 'tests', 'e2e'),
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
  },
  timeout: 30000,
  expect: {
    timeout: 15000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*auth\.setup\.(js|ts)/,
      timeout: 150000,
      use: {
        storageState: undefined,
        headless: false,
      },
    },
    {
      name: 'slack-e2e',
      testDir: path.join(__dirname, 'tests', 'e2e'),
      testMatch: /\.spec\.(js|ts)$/,
      use: {
        storageState: storageStatePath,
      },
    },
  ],
};

module.exports = config;
