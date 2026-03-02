const { mock } = require('bun:test');

function resetModuleCache(moduleIds = []) {
  if (typeof require.cache === 'undefined') return;
  for (const moduleId of moduleIds) {
    try {
      const resolved = require.resolve(moduleId);
      delete require.cache[resolved];
    } catch (_) {
      // Ignore modules not resolvable in a given test context.
    }
  }
}

function snapshotEnv(keys = []) {
  const state = {};
  for (const key of keys) state[key] = process.env[key];
  return state;
}

function restoreEnv(snapshot = {}) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function restoreAllMocks() {
  mock.restore();
}

module.exports = {
  resetModuleCache,
  snapshotEnv,
  restoreEnv,
  restoreAllMocks,
};
