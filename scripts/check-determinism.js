const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const isolatedSuites = [
  'tests/unit/a00-dataUtils.overrides.test.js',
  'tests/unit/a01-repository.overrides.test.js',
  'tests/unit/a02-triageLogic.overrides.test.js',
  'tests/unit/a03-dataUtils.readOverrides.test.js',
  'tests/unit/a04-triageLogic.scheduler.test.js',
];

const randomizedCoreSuites = [
  'tests/integration/railwayCron.test.js',
  'tests/unit/weekdayPolicy.test.js',
  'tests/unit/triageScheduler.test.js',
  'tests/unit/railwayConfig.contract.test.js',
];

function run(label, command, args) {
  console.log(`\n[determinism] ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return result.status === 0;
}

function main() {
  const failures = [];

  if (!run('stabilized baseline', 'node', ['scripts/test-stabilized.js'])) {
    failures.push('stabilized baseline');
  }

  for (const suite of randomizedCoreSuites) {
    if (!run(`randomized suite (${suite})`, 'bun', ['test', '--randomize', '--seed=1337', '--rerun-each=2', suite])) {
      failures.push(`randomized suite (${suite})`);
    }
  }

  for (const suite of isolatedSuites) {
    if (!run(`isolation stress (${suite})`, 'bun', ['test', '--serial', '--rerun-each=2', suite])) {
      failures.push(`isolation stress (${suite})`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n[determinism] FAILED: ${failures.join(', ')}`);
    process.exit(1);
  }

  console.log('\n[determinism] all checks passed.');
}

main();
