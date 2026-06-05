const { describe, it, expect, mock, beforeEach } = require('bun:test');

const readSprintsMock = mock();
const parsePTDateMock = mock();
const formatPTDateMock = mock();

function ptDayjs(str) {
  if (!str) return null;
  const dayjs = require('dayjs');
  const utc = require('dayjs/plugin/utc');
  const tz = require('dayjs/plugin/timezone');
  dayjs.extend(utc);
  dayjs.extend(tz);
  return dayjs.tz(`${str}T00:00:00`, 'America/Los_Angeles');
}

mock.module('../../appHome', () => ({
  slackApp: { command: () => {}, view: () => {} },
}));
mock.module('../../commandUtils', () => ({ getEnvironmentCommand: (name) => name }));
mock.module('../../dataUtils', () => ({
  readSprints: readSprintsMock,
  getSprintUsers: mock(() => Promise.resolve({})),
  parsePTDate: parsePTDateMock,
  formatPTDate: formatPTDateMock,
  getTodayPT: mock(() => ({})),
}));

const { findSprintForDate, buildScheduleModal } = require('../../scheduleCommandHandler');

describe('scheduleCommandHandler', () => {
  beforeEach(() => {
    mock.clearAllMocks();
    formatPTDateMock.mockImplementation((d, fmt) => (fmt === 'YYYY-MM-DD' ? d : d || 'formatted'));
    parsePTDateMock.mockImplementation(ptDayjs);
  });

  describe('findSprintForDate', () => {
    it('returns correct sprint when date falls in sprint range', async () => {
      const sprints = [
        { sprintName: 'S1', startDate: '2026-01-01', endDate: '2026-01-14' },
        { sprintName: 'S2', startDate: '2026-01-15', endDate: '2026-01-28' },
      ];
      readSprintsMock.mockResolvedValue(sprints);

      const midSprintDate = new Date('2026-01-08T12:00:00-08:00');
      const result = await findSprintForDate(midSprintDate);

      expect(result).not.toBeNull();
      expect(result.index).toBe(0);
      expect(result.sprintName).toBe('S1');
      expect(result.startDate).toBe('2026-01-01');
      expect(result.endDate).toBe('2026-01-14');
    });

    it('returns null when date is outside all sprints', async () => {
      readSprintsMock.mockResolvedValue([
        { sprintName: 'S1', startDate: '2026-01-01', endDate: '2026-01-14' },
      ]);

      const outsideDate = new Date('2025-12-01T12:00:00-08:00');
      const result = await findSprintForDate(outsideDate);

      expect(result).toBeNull();
    });
  });

  describe('buildScheduleModal', () => {
    it('includes sprint name and formatted date in blocks', () => {
      formatPTDateMock
        .mockReturnValueOnce('Friday, January 15, 2026')
        .mockReturnValueOnce('01/15/2026')
        .mockReturnValueOnce('01/27/2026');

      const date = '2026-01-15';
      const sprint = { sprintName: 'FY26 Sp2', startDate: '2026-01-15', endDate: '2026-01-27' };
      const userNames = { po: { slackId: 'U1', name: 'Alice' } };

      const modal = buildScheduleModal(date, sprint, userNames);

      expect(modal.blocks).toBeDefined();
      expect(modal.blocks.length).toBeGreaterThan(0);
      const textBlocks = modal.blocks.filter((b) => b.text?.text).map((b) => b.text.text);
      const hasSprintName = textBlocks.some((t) => t.includes('FY26 Sp2'));
      const hasFormattedDate = textBlocks.some((t) => t.includes('January') || t.includes('01/15'));
      expect(hasSprintName).toBe(true);
      expect(hasFormattedDate).toBe(true);
    });
  });
});
