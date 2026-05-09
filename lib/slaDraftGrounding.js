/**
 * Lightweight checks that draft bullet-style SLA cites resemble merged guideline text.
 * Paraphrases may match; invented bullets should often fail and trigger a user-visible hint.
 */

function normalizeSlaText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\*+|_+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  return normalizeSlaText(s)
    .split(/\W+/)
    .filter((w) => w.length > 2);
}

function collectCorpusFromGuidelines(guidelines) {
  if (!guidelines || typeof guidelines !== 'object') return [];

  const out = [];

  const pushStrings = (v) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };

  const walk = (node, depth = 0) => {
    if (depth > 12 || node == null) return;
    if (typeof node === 'string') {
      pushStrings(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;

    if (Array.isArray(node.objective_criteria)) {
      walk(node.objective_criteria, depth + 1);
    }

    const glossary = node.metadata?.domain_glossary || node.domain_glossary;
    if (glossary && typeof glossary === 'object') {
      Object.values(glossary).forEach((g) => walk(g, depth + 1));
    }

    for (const [k, v] of Object.entries(node)) {
      if (k === 'objective_criteria') continue;
      if (k === 'metadata') {
        walk(v, depth + 1);
        continue;
      }
      if (/^severity\d+$/i.test(k)) walk(v, depth + 1);
    }
  };

  walk(guidelines);
  return [...new Set(out)];
}

function longestPrefixContained(hay, needle) {
  const h = normalizeSlaText(hay);
  const n = normalizeSlaText(needle);
  if (!h.length || !n.length) return false;
  const max = Math.min(n.length, 45);
  for (let len = max; len >= 18; len--) {
    const slice = n.slice(0, len);
    if (h.includes(slice)) return true;
  }
  return false;
}

function tokenCoverage(fragmentTokens, criterionTokens) {
  if (!criterionTokens.length) return 0;
  const tf = new Set(fragmentTokens);
  const hit = criterionTokens.filter((t) => tf.has(t)).length;
  return hit / criterionTokens.length;
}

function fragmentGroundedInCorpus(fragment, corpus) {
  const nf = normalizeSlaText(fragment);
  if (nf.length < 36) return true;

  for (const c of corpus) {
    const nc = normalizeSlaText(c);
    if (nc.length < 12) continue;
    if (nf.includes(nc) || nc.includes(nf)) return true;
    if (longestPrefixContained(nf, nc) || longestPrefixContained(nc, nf)) return true;

    const tf = tokenize(fragment);
    const tc = tokenize(c);
    if (tc.length >= 4 && tokenCoverage(tf, tc) >= 0.52) return true;
  }
  return false;
}

function extractBulletBodies(draft) {
  const bodies = [];
  if (!draft || typeof draft !== 'string') return bodies;
  for (const line of draft.split(/\r?\n/)) {
    const trimmed = line.trim();
    const m = trimmed.match(/^[•\-*]\s*(.+)$/);
    if (m && m[1]) bodies.push(m[1].trim());
  }
  return bodies;
}

function shouldSkipBulletCheck(body) {
  const n = normalizeSlaText(body);
  if (n.length < 40) return true;
  if (/insufficient|additional details|need more|cannot assess|uncertain|unclear/i.test(n)) return true;
  if (/verify manually|automated qa|automated check/i.test(n)) return true;
  return false;
}

/**
 * @returns {{ grounded: boolean, ungroundedSamples: string[] }}
 */
function assessDraftSlaGrounding(draft, guidelines) {
  const corpus = collectCorpusFromGuidelines(guidelines);
  if (!corpus.length) return { grounded: true, ungroundedSamples: [] };

  const ungrounded = [];
  for (const body of extractBulletBodies(draft)) {
    if (shouldSkipBulletCheck(body)) continue;
    if (!fragmentGroundedInCorpus(body, corpus)) {
      ungrounded.push(body.slice(0, 120) + (body.length > 120 ? '…' : ''));
      if (ungrounded.length >= 3) break;
    }
  }

  return {
    grounded: ungrounded.length === 0,
    ungroundedSamples: ungrounded
  };
}

module.exports = {
  assessDraftSlaGrounding,
  collectCorpusFromGuidelines,
  extractBulletBodies,
  fragmentGroundedInCorpus,
  normalizeSlaText
};
