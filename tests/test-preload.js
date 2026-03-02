const { afterAll, mock } = require('bun:test');

// Bun's module mocks can leak across files in serial runs.
// Restore after each file's suite completes to keep isolation.
afterAll(() => {
  mock.restore();
});
