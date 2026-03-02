const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const testsRoot = path.join(repoRoot, 'tests');
const coverageRoot = path.join(repoRoot, 'coverage', 'stabilized');

const isolatedSuites = new Set([
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

function runSuite(label, files, suiteDir) {
  if (files.length === 0) return true;
  const outDir = path.join(coverageRoot, suiteDir);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`\n[stabilized-coverage] ${label}`);
  const result = spawnSync(
    'bun',
    [
      'test',
      '--serial',
      '--coverage',
      '--coverage-reporter=lcov',
      '--coverage-dir',
      outDir,
      ...files,
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );
  return result.status === 0;
}

function mergeLcovFiles() {
  const lcovParts = [];
  const suiteDirs = fs.readdirSync(coverageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(coverageRoot, entry.name));

  for (const dir of suiteDirs) {
    const lcovPath = path.join(dir, 'lcov.info');
    if (!fs.existsSync(lcovPath)) continue;
    const text = fs.readFileSync(lcovPath, 'utf8').trim();
    if (text.length > 0) lcovParts.push(text);
  }

  const mergedLcovPath = path.join(coverageRoot, 'lcov.info');
  fs.writeFileSync(mergedLcovPath, `${lcovParts.join('\n')}\n`, 'utf8');
  console.log(`[stabilized-coverage] merged lcov -> ${path.relative(repoRoot, mergedLcovPath)}`);
}

function main() {
  fs.rmSync(coverageRoot, { recursive: true, force: true });
  fs.mkdirSync(coverageRoot, { recursive: true });

  const allSuites = walk(testsRoot).sort();
  const sharedSuites = allSuites.filter((suite) => !isolatedSuites.has(suite));
  const isolatedPresent = [...isolatedSuites].filter((suite) => allSuites.includes(suite));

  const failed = [];

  if (!runSuite('shared suites', sharedSuites, 'shared')) {
    failed.push('shared suites');
  }

  for (const suite of isolatedPresent) {
    const suiteDir = suite.replace(/[\\/]/g, '__').replace(/\.js$/i, '');
    if (!runSuite(`isolated suite: ${suite}`, [suite], suiteDir)) {
      failed.push(suite);
    }
  }

  mergeLcovFiles();

  if (failed.length > 0) {
    console.error(`\n[stabilized-coverage] FAILED: ${failed.join(', ')}`);
    process.exit(1);
  }

  console.log('\n[stabilized-coverage] All suites passed.');
}

main();
