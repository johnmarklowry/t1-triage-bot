const { describe, it, expect, afterEach } = require('bun:test');
const { resetModuleCache } = require('../helpers/mockIsolation');

function loadCommandUtilsWithAppEnv(appEnv) {
  if (appEnv === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = appEnv;
  }
  resetModuleCache(['../../config', '../../commandUtils']);
  return require('../../commandUtils');
}

describe('commandUtils', () => {
  const origEnv = { APP_ENV: process.env.APP_ENV, ENVIRONMENT: process.env.ENVIRONMENT };

  afterEach(() => {
    process.env.APP_ENV = origEnv.APP_ENV;
    process.env.ENVIRONMENT = origEnv.ENVIRONMENT;
  });

  describe('getEnvironmentCommand', () => {
    it('returns /base-staging when APP_ENV is staging', () => {
      const commandUtils = loadCommandUtilsWithAppEnv('staging');
      expect(commandUtils.getEnvironmentCommand('triage-schedule')).toBe('/triage-schedule-staging');
    });

    it('returns /base when ENVIRONMENT is staging but APP_ENV is not staging', () => {
      process.env.ENVIRONMENT = 'staging';
      const commandUtils = loadCommandUtilsWithAppEnv('');
      expect(commandUtils.getEnvironmentCommand('triage-override')).toBe('/triage-override');
    });

    it('returns /base when not staging', () => {
      const commandUtils = loadCommandUtilsWithAppEnv('production');
      expect(commandUtils.getEnvironmentCommand('triage-schedule')).toBe('/triage-schedule');
    });

    it('returns /base when APP_ENV and ENVIRONMENT are unset', () => {
      delete process.env.APP_ENV;
      delete process.env.ENVIRONMENT;
      resetModuleCache(['../../config', '../../commandUtils']);
      const commandUtils = require('../../commandUtils');
      expect(commandUtils.getEnvironmentCommand('admin-sprints')).toBe('/admin-sprints');
    });
  });

  describe('getEnvironmentCommands', () => {
    it('maps array of base commands to environment-specific names', () => {
      const commandUtils = loadCommandUtilsWithAppEnv('staging');
      const result = commandUtils.getEnvironmentCommands(['triage-schedule', 'admin-sprints']);
      expect(result).toEqual(['/triage-schedule-staging', '/admin-sprints-staging']);
    });

    it('returns production-style commands when not staging', () => {
      const commandUtils = loadCommandUtilsWithAppEnv('production');
      const result = commandUtils.getEnvironmentCommands(['triage-schedule']);
      expect(result).toEqual(['/triage-schedule']);
    });
  });
});
