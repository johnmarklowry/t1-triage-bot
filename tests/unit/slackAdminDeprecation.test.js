const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { snapshotEnv, restoreEnv } = require('../helpers/mockIsolation');

describe('slackAdminDeprecation', () => {
  const envSnap = snapshotEnv([
    'WEB_ADMIN_SECRET',
    'SLACK_CLIENT_ID',
    'SLACK_CLIENT_SECRET',
    'SLACK_OAUTH_REDIRECT_URI',
    'SESSION_SECRET',
    'DEPRECATE_SLACK_ADMIN_COMMANDS',
    'PUBLIC_APP_URL',
  ]);

  beforeEach(() => {
    delete process.env.WEB_ADMIN_SECRET;
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_OAUTH_REDIRECT_URI;
    delete process.env.SESSION_SECRET;
    delete process.env.DEPRECATE_SLACK_ADMIN_COMMANDS;
    delete process.env.PUBLIC_APP_URL;
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  function loadModule() {
    const modulePath = require.resolve('../../lib/slackAdminDeprecation');
    delete require.cache[modulePath];
    delete require.cache[require.resolve('../../lib/slackOAuthConfig')];
    return require('../../lib/slackAdminDeprecation');
  }

  it('deprecates admin commands by default when web admin secret is set', () => {
    process.env.WEB_ADMIN_SECRET = 'secret';
    const mod = loadModule();
    expect(mod.isSlackAdminManagementDeprecated()).toBe(true);
  });

  it('allows opt-out via DEPRECATE_SLACK_ADMIN_COMMANDS=false', () => {
    process.env.WEB_ADMIN_SECRET = 'secret';
    process.env.DEPRECATE_SLACK_ADMIN_COMMANDS = 'false';
    const mod = loadModule();
    expect(mod.isSlackAdminManagementDeprecated()).toBe(false);
  });

  it('builds admin message with PUBLIC_APP_URL link', () => {
    process.env.PUBLIC_APP_URL = 'https://triage-bot.example.com';
    const mod = loadModule();
    const message = mod.buildDeprecatedAdminMessage();
    expect(message).toContain('https://triage-bot.example.com/admin');
    expect(message).toContain('deprecated');
  });

  it('deprecates Slack override requests when OAuth dashboard is available', () => {
    process.env.SLACK_CLIENT_ID = 'cid';
    process.env.SLACK_CLIENT_SECRET = 'sec';
    process.env.SLACK_OAUTH_REDIRECT_URI = 'http://localhost/cb';
    process.env.SESSION_SECRET = 'sess';
    const mod = loadModule();
    expect(mod.isSlackOverrideRequestDeprecated()).toBe(true);
  });
});
