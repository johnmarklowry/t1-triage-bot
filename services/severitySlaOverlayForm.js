/**
 * Build / merge Severity SLA overlay patches from Admin Hub form fields.
 */
const deepMergeSlaPatch = require('../lib/deepMergeSlaPatch');
const baseSlaGuidelines = require('../sla-guidelines.json');

const KEY_INVENTORY = 'search_inventory_sit_lcertified';
const KEY_SITE_SEARCH = 'site_search';

function clone(obj) {
  return JSON.parse(JSON.stringify(obj == null ? {} : obj));
}

/** Empty string = omit overlay key. Matching repo default = omit (avoid redundant DB patch). */
function normalizeGlossaryOverlayValue(trimmedField, baseDefault) {
  if (trimmedField === '') return '';
  const b =
    typeof baseDefault === 'string' ? baseDefault.trim() : String(baseDefault ?? '').trim();
  if (b !== '' && trimmedField === b) return '';
  return trimmedField;
}

function pruneEmptyNested(patch) {
  const p = patch;
  if (!p.metadata || typeof p.metadata !== 'object') return;
  const dg = p.metadata.domain_glossary;
  if (dg && typeof dg === 'object' && Object.keys(dg).length === 0) {
    delete p.metadata.domain_glossary;
  }
  if (Object.keys(p.metadata).length === 0) {
    delete p.metadata;
  }
}

/**
 * Initial strings for glossary inputs: overlay wins, then repo defaults from baseSla.
 */
function getGlossaryInitialStrings(patchJson, baseSla) {
  const overlayGl = patchJson?.metadata?.domain_glossary;
  const baseGl = baseSla?.metadata?.domain_glossary;
  const inv =
    typeof overlayGl?.[KEY_INVENTORY] === 'string'
      ? overlayGl[KEY_INVENTORY]
      : typeof baseGl?.[KEY_INVENTORY] === 'string'
        ? baseGl[KEY_INVENTORY]
        : '';
  const site =
    typeof overlayGl?.[KEY_SITE_SEARCH] === 'string'
      ? overlayGl[KEY_SITE_SEARCH]
      : typeof baseGl?.[KEY_SITE_SEARCH] === 'string'
        ? baseGl[KEY_SITE_SEARCH]
        : '';
  return { inventory: inv, siteSearch: site };
}

/**
 * Strip glossary from patch clone for "advanced JSON" initial display (avoid duplicating glossary).
 */
function patchWithoutGlossary(patch) {
  const p = clone(patch);
  if (p.metadata?.domain_glossary) {
    delete p.metadata.domain_glossary;
  }
  pruneEmptyNested(p);
  return p;
}

function getAdvancedInitialText(patchJson, maxLen) {
  const stripped = patchWithoutGlossary(patchJson || {});
  if (!stripped || Object.keys(stripped).length === 0) return '';
  const text = JSON.stringify(stripped, null, 2);
  return text.length > maxLen ? `${text.slice(0, maxLen)}\n…` : text;
}

/**
 * Apply glossary fields on top of patch (empty string removes overlay key only).
 */
function applyGlossaryFields(patch, inventoryTrimmed, siteTrimmed) {
  const p = patch;
  if (!p.metadata || typeof p.metadata !== 'object') {
    p.metadata = {};
  }
  if (!p.metadata.domain_glossary || typeof p.metadata.domain_glossary !== 'object') {
    p.metadata.domain_glossary = {};
  }
  const dg = p.metadata.domain_glossary;

  if (inventoryTrimmed === '') {
    delete dg[KEY_INVENTORY];
  } else {
    dg[KEY_INVENTORY] = inventoryTrimmed;
  }

  if (siteTrimmed === '') {
    delete dg[KEY_SITE_SEARCH];
  } else {
    dg[KEY_SITE_SEARCH] = siteTrimmed;
  }

  pruneEmptyNested(p);
}

/**
 * Existing patch → merge advanced JSON → apply glossary (glossary wins on those paths).
 * @throws {Error} if advancedRaw is non-empty invalid JSON
 */
function assembleOverlayPatchFromForm({ existingPatch, glossaryInventory, glossarySiteSearch, advancedRaw }) {
  let merged = clone(existingPatch);

  const advTrim = String(advancedRaw ?? '').trim();
  if (advTrim !== '') {
    let advancedObj;
    try {
      advancedObj = JSON.parse(advTrim);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Advanced JSON: ${msg}`);
    }
    if (advancedObj === null || typeof advancedObj !== 'object' || Array.isArray(advancedObj)) {
      throw new Error('Advanced JSON must be an object (not an array).');
    }
    merged = deepMergeSlaPatch(merged, advancedObj);
  }

  const baseGl = baseSlaGuidelines?.metadata?.domain_glossary || {};
  const invNorm = normalizeGlossaryOverlayValue(
    String(glossaryInventory ?? '').trim(),
    baseGl[KEY_INVENTORY]
  );
  const siteNorm = normalizeGlossaryOverlayValue(
    String(glossarySiteSearch ?? '').trim(),
    baseGl[KEY_SITE_SEARCH]
  );
  applyGlossaryFields(merged, invNorm, siteNorm);

  pruneEmptyNested(merged);

  return merged;
}

module.exports = {
  KEY_INVENTORY,
  KEY_SITE_SEARCH,
  getGlossaryInitialStrings,
  getAdvancedInitialText,
  assembleOverlayPatchFromForm,
};
