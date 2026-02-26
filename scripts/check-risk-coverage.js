const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const lcovPath = path.join(repoRoot, 'coverage', 'stabilized', 'lcov.info');

const coveragePolicy = [
  {
    file: 'routes/railwayCron.js',
    min: { lines: 90, functions: 90, branches: 80 },
  },
  {
    file: 'jobs/railwayNotifyRotation.js',
    min: { lines: 85, functions: 85, branches: 70 },
  },
  {
    file: 'triageLogic.js',
    min: { lines: 44, functions: 70, branches: 55 },
  },
  {
    file: 'dataUtils.js',
    min: { lines: 39, functions: 60, branches: 50 },
  },
];

function ensureRecord(records, sf) {
  if (!records[sf]) {
    records[sf] = {
      lineHits: new Map(),
      fnHits: new Map(),
      fnFound: new Set(),
      brHits: new Map(),
      brFound: new Set(),
    };
  }
  return records[sf];
}

function parseLcov(text) {
  const records = {};
  let currentSf = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      currentSf = line.slice(3);
      ensureRecord(records, currentSf);
      continue;
    }
    if (!currentSf) continue;

    const rec = records[currentSf];

    if (line.startsWith('DA:')) {
      const [lineNoStr, hitsStr] = line.slice(3).split(',');
      const lineNo = Number(lineNoStr);
      const hits = Number(hitsStr);
      rec.lineHits.set(lineNo, (rec.lineHits.get(lineNo) || 0) + (Number.isFinite(hits) ? hits : 0));
      continue;
    }

    if (line.startsWith('FN:')) {
      const [lineNoStr, ...nameParts] = line.slice(3).split(',');
      const fnLine = Number(lineNoStr);
      const fnName = nameParts.join(',');
      const fnKey = `${fnLine}:${fnName}`;
      rec.fnFound.add(fnKey);
      if (!rec.fnHits.has(fnKey)) rec.fnHits.set(fnKey, 0);
      continue;
    }

    if (line.startsWith('FNDA:')) {
      const [hitsStr, ...nameParts] = line.slice(5).split(',');
      const fnName = nameParts.join(',');
      const hits = Number(hitsStr);
      const fnKey = [...rec.fnFound].find((k) => k.endsWith(`:${fnName}`)) || `0:${fnName}`;
      rec.fnFound.add(fnKey);
      rec.fnHits.set(fnKey, (rec.fnHits.get(fnKey) || 0) + (Number.isFinite(hits) ? hits : 0));
      continue;
    }

    if (line.startsWith('BRDA:')) {
      const [lineNo, blockNo, branchNo, takenRaw] = line.slice(5).split(',');
      const brKey = `${lineNo}:${blockNo}:${branchNo}`;
      rec.brFound.add(brKey);
      const taken = takenRaw === '-' ? 0 : Number(takenRaw);
      rec.brHits.set(brKey, (rec.brHits.get(brKey) || 0) + (Number.isFinite(taken) ? taken : 0));
      continue;
    }
  }

  return records;
}

function percent(hit, found) {
  if (!found) return null;
  return (hit / found) * 100;
}

function summarizeRecord(rec) {
  const lineFound = rec.lineHits.size;
  const lineHit = [...rec.lineHits.values()].filter((hits) => hits > 0).length;

  const fnFound = rec.fnFound.size;
  const fnHit = [...rec.fnFound].filter((k) => (rec.fnHits.get(k) || 0) > 0).length;

  const brFound = rec.brFound.size;
  const brHit = [...rec.brFound].filter((k) => (rec.brHits.get(k) || 0) > 0).length;

  return {
    lines: { hit: lineHit, found: lineFound, pct: percent(lineHit, lineFound) },
    functions: { hit: fnHit, found: fnFound, pct: percent(fnHit, fnFound) },
    branches: { hit: brHit, found: brFound, pct: percent(brHit, brFound) },
  };
}

function findRecordByFile(records, relativePath) {
  const normalizedSuffix = path.normalize(relativePath);
  const candidates = Object.keys(records).filter((sf) => path.normalize(sf).endsWith(normalizedSuffix));
  if (candidates.length === 0) return null;

  // Use longest match to avoid accidental short suffix collisions.
  candidates.sort((a, b) => b.length - a.length);
  return records[candidates[0]];
}

function formatMetric(name, metric, min) {
  if (metric.pct === null) {
    return `${name}: n/a (${metric.hit}/${metric.found}) [min ${min}%]`;
  }
  return `${name}: ${metric.pct.toFixed(2)}% (${metric.hit}/${metric.found}) [min ${min}%]`;
}

function main() {
  if (!fs.existsSync(lcovPath)) {
    console.error(`[risk-coverage] missing lcov file: ${path.relative(repoRoot, lcovPath)}`);
    process.exit(1);
  }

  const parsed = parseLcov(fs.readFileSync(lcovPath, 'utf8'));
  const failures = [];
  const reportLines = [];

  for (const policy of coveragePolicy) {
    const rec = findRecordByFile(parsed, policy.file);
    if (!rec) {
      failures.push(`${policy.file}: no coverage record found`);
      continue;
    }
    const summary = summarizeRecord(rec);
    reportLines.push(`\n${policy.file}`);
    reportLines.push(`  ${formatMetric('lines', summary.lines, policy.min.lines)}`);
    reportLines.push(`  ${formatMetric('functions', summary.functions, policy.min.functions)}`);
    reportLines.push(`  ${formatMetric('branches', summary.branches, policy.min.branches)}`);

    if (summary.lines.pct !== null && summary.lines.pct < policy.min.lines) {
      failures.push(`${policy.file}: lines ${summary.lines.pct.toFixed(2)}% < ${policy.min.lines}%`);
    }
    if (summary.functions.pct !== null && summary.functions.pct < policy.min.functions) {
      failures.push(`${policy.file}: functions ${summary.functions.pct.toFixed(2)}% < ${policy.min.functions}%`);
    }
    if (summary.branches.pct !== null && summary.branches.pct < policy.min.branches) {
      failures.push(`${policy.file}: branches ${summary.branches.pct.toFixed(2)}% < ${policy.min.branches}%`);
    }
  }

  const reportPath = path.join(repoRoot, 'coverage', 'stabilized', 'risk-coverage-report.txt');
  fs.writeFileSync(reportPath, `${reportLines.join('\n')}\n`, 'utf8');
  console.log(`[risk-coverage] report: ${path.relative(repoRoot, reportPath)}`);
  console.log(reportLines.join('\n'));

  if (failures.length > 0) {
    console.error('\n[risk-coverage] threshold failures:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\n[risk-coverage] all critical-module thresholds met.');
}

main();
