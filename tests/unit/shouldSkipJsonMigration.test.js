const { describe, it, expect } = require('bun:test');
const { shouldSkipJsonMigration } = require('../../lib/shouldSkipJsonMigration');

describe('shouldSkipJsonMigration', () => {
  it('returns false when FORCE_SEED is true (migration should run)', async () => {
    const getSprintCount = async () => 10;
    const result = await shouldSkipJsonMigration(true, getSprintCount);
    expect(result).toBe(false);
  });

  it('returns true when DB has data (sprint count > 0) and FORCE_SEED is false (skip migration)', async () => {
    const getSprintCount = async () => 5;
    const result = await shouldSkipJsonMigration(false, getSprintCount);
    expect(result).toBe(true);
  });

  it('returns false when DB is empty (sprint count 0) and FORCE_SEED is false (run migration)', async () => {
    const getSprintCount = async () => 0;
    const result = await shouldSkipJsonMigration(false, getSprintCount);
    expect(result).toBe(false);
  });

  it('returns false when getSprintCount throws (fail-open: run migration)', async () => {
    const getSprintCount = async () => {
      throw new Error('DB unreachable');
    };
    const result = await shouldSkipJsonMigration(false, getSprintCount);
    expect(result).toBe(false);
  });

  it('returns true when sprint count is 1 (DB has been seeded)', async () => {
    const getSprintCount = async () => 1;
    const result = await shouldSkipJsonMigration(false, getSprintCount);
    expect(result).toBe(true);
  });
});
