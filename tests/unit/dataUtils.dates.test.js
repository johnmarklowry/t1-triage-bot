const { describe, it, expect, mock, afterAll } = require('bun:test');

process.env.USE_DATABASE = 'true';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OVERRIDES_SOURCE = '';

mock.module('../../cache/redisClient', () => ({
  getJson: mock(() => Promise.resolve(null)),
  setJson: mock(() => Promise.resolve()),
  del: mock(() => Promise.resolve()),
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve()),
}));

// Mock connection only so real db/repository is used (avoids polluting repo for 0-repository.overrides.test)
const connectionQuery = mock(() => Promise.resolve({ rows: [] }));
const connectionTransaction = mock(async (fn) => {
  const client = { query: mock(() => Promise.resolve({ rows: [] })) };
  return await fn(client);
});
mock.module('../../db/connection', () => ({
  query: connectionQuery,
  transaction: connectionTransaction,
  getHealthStatus: mock(() => Promise.resolve({ status: 'healthy' })),
  testConnection: mock(() => Promise.resolve(true)),
}));

const dataUtils = require('../../dataUtils');

describe('dataUtils date helpers', () => {
  describe('parsePTDate', () => {
    it('returns dayjs object for valid YYYY-MM-DD', () => {
      const result = dataUtils.parsePTDate('2026-01-15');
      expect(result).not.toBeNull();
      expect(result.format('YYYY-MM-DD')).toBe('2026-01-15');
    });

    it('returns null for empty string', () => {
      expect(dataUtils.parsePTDate('')).toBeNull();
    });

    it('returns null for invalid format', () => {
      expect(dataUtils.parsePTDate('01/15/2026')).toBeNull();
      expect(dataUtils.parsePTDate('not-a-date')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(dataUtils.parsePTDate(null)).toBeNull();
      expect(dataUtils.parsePTDate(undefined)).toBeNull();
    });
  });

  describe('formatPTDate', () => {
    it('formats date with default format', () => {
      const result = dataUtils.formatPTDate('2026-01-15');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/\d/);
    });

    it('formats date with custom format', () => {
      const result = dataUtils.formatPTDate('2026-01-15', 'YYYY-MM-DD');
      expect(result).toBe('2026-01-15');
    });
  });

  describe('formatSprintRangePT', () => {
    it('formats same-year range', () => {
      const result = dataUtils.formatSprintRangePT('2026-01-14', '2026-01-27');
      expect(result).toContain('Jan');
      expect(result).toContain('2026');
    });

    it('formats cross-year range', () => {
      const result = dataUtils.formatSprintRangePT('2026-12-29', '2027-01-11');
      expect(result).toContain('2026');
      expect(result).toContain('2027');
    });

    it('returns N/A for invalid dates', () => {
      const result = dataUtils.formatSprintRangePT('', '2026-01-27');
      expect(result).toContain('N/A');
    });
  });

  describe('formatSprintLabelPT', () => {
    it('includes sprint name and range', () => {
      const result = dataUtils.formatSprintLabelPT('FY26 Sp22', '2026-01-14', '2026-01-27');
      expect(result).toContain('FY26 Sp22');
      expect(result).toContain('Jan');
    });

    it('falls back to Sprint when name empty', () => {
      const result = dataUtils.formatSprintLabelPT('', '2026-01-14', '2026-01-27');
      expect(result).toContain('Sprint');
    });
  });

  describe('getTodayPT', () => {
    it('returns dayjs at start of day PT', () => {
      const result = dataUtils.getTodayPT();
      expect(result).not.toBeNull();
      expect(result.hour()).toBe(0);
      expect(result.minute()).toBe(0);
    });
  });
});

afterAll(() => {
  mock.restore();
});
