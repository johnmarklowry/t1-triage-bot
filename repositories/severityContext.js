const prisma = require('../lib/prisma-client');
const deepMergeSlaPatch = require('../lib/deepMergeSlaPatch');
const baseSlaGuidelines = require('../sla-guidelines.json');

const mergedCache = {
  data: null,
  expiresAt: 0,
};

function useDatabase() {
  return process.env.USE_DATABASE !== 'false' && !!process.env.DATABASE_URL;
}

function getCacheTtlMs() {
  const n = Number(process.env.SLA_MERGED_CACHE_TTL_MS);
  return Number.isFinite(n) && n >= 0 ? n : 30000;
}

function cloneBase() {
  return JSON.parse(JSON.stringify(baseSlaGuidelines));
}

function invalidateMergedSlaCache() {
  mergedCache.data = null;
  mergedCache.expiresAt = 0;
}

function normalizePatchJson(patchJson) {
  if (patchJson == null) return {};
  if (typeof patchJson !== 'object' || Array.isArray(patchJson)) return {};
  return patchJson;
}

/**
 * Merged SLA guidelines (file base + DB patch), TTL-cached.
 */
async function getMergedSlaGuidelines() {
  const now = Date.now();
  const ttl = getCacheTtlMs();
  if (mergedCache.data != null && now < mergedCache.expiresAt) {
    return mergedCache.data;
  }

  let merged = cloneBase();

  if (!useDatabase()) {
    mergedCache.data = merged;
    mergedCache.expiresAt = now + ttl;
    return merged;
  }

  try {
    const row = await prisma.severityContextOverlay.findUnique({ where: { id: 1 } });
    const patch = normalizePatchJson(row?.patchJson);
    if (Object.keys(patch).length > 0) {
      merged = deepMergeSlaPatch(cloneBase(), patch);
    }
  } catch (err) {
    console.error('[severityContext] DB read failed, using file-only SLA guidelines:', err.message);
    merged = cloneBase();
  }

  mergedCache.data = merged;
  mergedCache.expiresAt = now + ttl;
  return merged;
}

/**
 * Current overlay row for admin UI (patch only; merged SLA is built separately).
 */
async function getSeverityPatchRecord() {
  if (!useDatabase()) {
    return { id: 1, patchJson: {}, updatedAt: null, updatedBy: null };
  }

  try {
    const row = await prisma.severityContextOverlay.findUnique({ where: { id: 1 } });
    if (!row) {
      return { id: 1, patchJson: {}, updatedAt: null, updatedBy: null };
    }
    return { ...row, patchJson: normalizePatchJson(row.patchJson) };
  } catch (err) {
    console.error('[severityContext] getSeverityPatchRecord failed:', err.message);
    return { id: 1, patchJson: {}, updatedAt: null, updatedBy: null };
  }
}

/**
 * Upsert singleton patch + audit log entry.
 */
async function saveSeverityPatch({ patchJson, updatedBy }) {
  if (!useDatabase()) {
    throw new Error('Database is not configured (set DATABASE_URL and USE_DATABASE).');
  }

  const patch = normalizePatchJson(patchJson);
  const prev = await prisma.severityContextOverlay.findUnique({ where: { id: 1 } });

  const row = await prisma.severityContextOverlay.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      patchJson: patch,
      updatedBy: updatedBy || null,
    },
    update: {
      patchJson: patch,
      updatedBy: updatedBy || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tableName: 'severity_context_overlay',
      recordId: 1,
      operation: prev ? 'UPDATE' : 'CREATE',
      oldValues: prev ? { patchJson: prev.patchJson, updatedBy: prev.updatedBy } : null,
      newValues: { patchJson: row.patchJson, updatedBy: row.updatedBy },
      changedBy: updatedBy || null,
      reason: 'Severity SLA overlay updated via Admin Hub',
    },
  });

  invalidateMergedSlaCache();
  return row;
}

module.exports = {
  getMergedSlaGuidelines,
  getSeverityPatchRecord,
  saveSeverityPatch,
  invalidateMergedSlaCache,
};
