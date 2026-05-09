/**
 * Deep-merge a patch object onto a base SLA guidelines object.
 * - Plain objects: recurse per key
 * - Arrays: patch value replaces base at that key
 * - Primitives / null: patch replaces base
 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeSlaPatch(base, patch) {
  if (patch === undefined) return base;
  if (Array.isArray(patch)) return patch.slice();
  if (!isPlainObject(patch)) return patch;

  const source = isPlainObject(base) ? base : {};
  const out = { ...source };

  for (const key of Object.keys(patch)) {
    const pVal = patch[key];
    const bVal = source[key];

    if (Array.isArray(pVal)) {
      out[key] = pVal.slice();
    } else if (isPlainObject(pVal)) {
      out[key] = deepMergeSlaPatch(isPlainObject(bVal) ? bVal : {}, pVal);
    } else {
      out[key] = pVal;
    }
  }

  return out;
}

module.exports = deepMergeSlaPatch;
