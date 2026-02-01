const { describe, it, expect, beforeEach, afterEach } = require('bun:test');

const commandUtils = require('../../commandUtils');

describe('commandUtils', () => {
  const origEnv = { APP_ENV: process.env.APP_ENV, ENVIRONMENT: process.env.ENVIRONMENT };

  afterEach(() => {
    process.env.APP_ENV = origEnv.APP_ENV;
    process.env.ENVIRONMENT = origEnv.ENVIRONMENT;
  });

  describe('getEnvironmentCommand', () => {
    it('returns /base-staging when APP_ENV is staging', () => {
      process.env.APP_ENV = 'staging';
      process.env.ENVIRONMENT = '';
      expect(commandUtils.getEnvironmentCommand('triage-schedule')).toBe('/triage-schedule-staging');
    });

    it('returns /base-staging when ENVIRONMENT is staging', () => {
      process.env.APP_ENV = '';
      process.env.ENVIRONMENT = 'staging';
      expect(commandUtils.getEnvironmentCommand('triage-override')).toBe('/triage-override-staging');
    });

    it('returns /base when not staging', () => {
      process.env.APP_ENV = 'production';
      process.env.ENVIRONMENT = 'production';
      expect(commandUtils.getEnvironmentCommand('triage-schedule')).toBe('/triage-schedule');
    });

    it('returns /base when APP_ENV and ENVIRONMENT are unset', () => {
      delete process.env.APP_ENV;
      delete process.env.ENVIRONMENT;
      expect(commandUtils.getEnvironmentCommand('admin-sprints')).toBe('/admin-sprints');
    });
  });

  describe('getEnvironmentCommands', () => {
    it('maps array of base commands to environment-specific names', () => {
      process.env.APP_ENV = 'staging';
      process.env.ENVIRONMENT = '';
      const result = commandUtils.getEnvironmentCommands(['triage-schedule', 'admin-sprints']);
      expect(result).toEqual(['/triage-schedule-staging', '/admin-sprints-staging']);
    });

    it('returns production-style commands when not staging', () => {
      process.env.APP_ENV = 'production';
      process.env.ENVIRONMENT = '';
      const result = commandUtils.getEnvironmentCommands(['triage-schedule']);
      expect(result).toEqual(['/triage-schedule']);
    });
  });
});
