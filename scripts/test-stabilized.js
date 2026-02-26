const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const testsRoot = path.join(repoRoot, 'tests');

const isolatedSuites = new Set([
  // Keep mock-heavy suites here to guarantee process isolation.
  'tests/unit/a00-dataUtils.overrides.test.js',
  'tests/unit/a01-repository.overrides.test.js',
  'tests/unit/a02-triageLogic.overrides.test.js',
  'tests/unit/a03-dataUtils.readOverrides.test.js',
  'tests/unit/a04-triageLogic.scheduler.test.js',
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(path.relative(repoRoot, fullPath).replace(/\\/g, '/'));
    }
  }
  return files;
}

function runSuite(label, files) {
  if (files.length === 0) return true;
  console.log(`\n[stabilized-tests] ${label}`);
  const result = spawnSync('bun', ['test', '--serial', ...files], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return result.status === 0;
}

function main() {
  const allSuites = walk(testsRoot).sort();
  const sharedSuites = allSuites.filter((suite) => !isolatedSuites.has(suite));
  const isolatedPresent = [...isolatedSuites].filter((suite) => allSuites.includes(suite));

  const failed = [];

  if (!runSuite('shared suites', sharedSuites)) {
    failed.push('shared suites');
  }

  for (const suite of isolatedPresent) {
    if (!runSuite(`isolated suite: ${suite}`, [suite])) {
      failed.push(suite);
    }
  }

  if (failed.length > 0) {
    console.error(`\n[stabilized-tests] FAILED: ${failed.join(', ')}`);
    process.exit(1);
  }

  console.log('\n[stabilized-tests] All suites passed.');
}

main();
