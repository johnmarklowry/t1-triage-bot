const { describe, it, expect } = require('bun:test');
const baseGuidelines = require('../../sla-guidelines.json');
const {
  assessDraftSlaGrounding,
  collectCorpusFromGuidelines,
  fragmentGroundedInCorpus
} = require('../../lib/slaDraftGrounding');

describe('slaDraftGrounding', () => {
  it('collects objective criteria and glossary from base SLA JSON', () => {
    const corpus = collectCorpusFromGuidelines(baseGuidelines);
    expect(corpus.some((s) => s.includes('Search Inventory Tool'))).toBe(true);
    expect(corpus.some((s) => s.includes('Site search means'))).toBe(true);
  });

  it('accepts a draft bullet that closely matches an objective criterion', () => {
    const draft = `*Assessment*
• Search Inventory Tool (SIT): inventory search returning no results or incorrect results
• Next steps per SLA`;
    const { grounded } = assessDraftSlaGrounding(draft, baseGuidelines);
    expect(grounded).toBe(true);
  });

  it('flags long fabricated bullets that do not match the corpus', () => {
    const draft = `*Assessment*
• Level 1 — The primary chromodynamic flux inverter misaligns hexadecimal telemetry buffers on the auxiliary polymorphic substrate`;
    const { grounded, ungroundedSamples } = assessDraftSlaGrounding(draft, baseGuidelines);
    expect(grounded).toBe(false);
    expect(ungroundedSamples.length).toBeGreaterThan(0);
  });

  it('fragmentGroundedInCorpus handles paraphrases with shared tokens', () => {
    const corpus = collectCorpusFromGuidelines(baseGuidelines);
    const loose =
      'inventory search is returning incorrect results for users trying to find certified vehicles';
    expect(fragmentGroundedInCorpus(loose, corpus)).toBe(true);
  });
});
