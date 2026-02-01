#!/usr/bin/env bun
// Run Playwright e2e with Bun. Avoids "Column must be greater than or equal to 0, got -1"
// (Bun can produce column -1 in stack frames; source-map throws when mapping them).
// See: https://github.com/oven-sh/bun/issues/17303

const Module = require('module');
if (typeof Module.setSourceMapsSupport === 'function') {
  Module.setSourceMapsSupport(false);
}

// Patch source-map so negative columns from Bun stack frames don't throw (Bun can emit column -1)
try {
  const consumer = require('source-map/lib/source-map-consumer');
  const Basic = consumer.BasicSourceMapConsumer;
  if (Basic && Basic.prototype._findMapping) {
    const original = Basic.prototype._findMapping;
    Basic.prototype._findMapping = function (aNeedle, aMappings, aLineName, aColumnName, aComparator, aBias) {
      if (aNeedle[aColumnName] != null && aNeedle[aColumnName] < 0) {
        aNeedle = Object.assign({}, aNeedle, { [aColumnName]: 0 });
      }
      return original.call(this, aNeedle, aMappings, aLineName, aColumnName, aComparator, aBias);
    };
  }
} catch (_) {
  // source-map may be bundled; patch may not apply
}

require('@playwright/test/cli.js');
