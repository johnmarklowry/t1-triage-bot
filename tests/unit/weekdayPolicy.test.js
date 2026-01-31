const { describe, it, expect } = require('bun:test');

const { shouldDeferNotification, nextBusinessDay } = require('../../services/notifications/weekdayPolicy');

describe('weekdayPolicy', () => {
  describe('shouldDeferNotification', () => {
    it('returns true for Saturday (PT)', () => {
      // 2026-01-03 is Saturday in America/Los_Angeles
      const sat = new Date('2026-01-03T12:00:00-08:00');
      expect(shouldDeferNotification(sat)).toBe(true);
    });

    it('returns true for Sunday (PT)', () => {
      // 2026-01-04 is Sunday in America/Los_Angeles
      const sun = new Date('2026-01-04T12:00:00-08:00');
      expect(shouldDeferNotification(sun)).toBe(true);
    });

    it('returns false for Monday (PT)', () => {
      const mon = new Date('2026-01-05T12:00:00-08:00');
      expect(shouldDeferNotification(mon)).toBe(false);
    });

    it('returns false for Friday (PT)', () => {
      const fri = new Date('2026-01-02T12:00:00-08:00');
      expect(shouldDeferNotification(fri)).toBe(false);
    });
  });

  describe('nextBusinessDay', () => {
    it('skips weekend and returns next weekday', () => {
      const friday = new Date('2026-01-02T15:00:00-08:00');
      const next = nextBusinessDay(friday);
      expect(next).toBeInstanceOf(Date);
      const day = next.getUTCDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    });

    it('from Saturday returns Monday', () => {
      const sat = new Date('2026-01-03T12:00:00-08:00');
      const next = nextBusinessDay(sat);
      const day = next.getUTCDay();
      expect(day).toBe(1);
    });
  });
});
