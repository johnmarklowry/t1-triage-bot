const { describe, it, expect, mock, beforeEach, afterEach, afterAll } = require('bun:test');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { resetModuleCache, snapshotEnv, restoreEnv, restoreAllMocks } = require('../helpers/mockIsolation');

dayjs.extend(utc);
dayjs.extend(timezone);

restoreAllMocks();

const envKeys = ['USE_DATABASE', 'DATABASE_URL', 'OVERRIDES_SOURCE', 'OVERRIDES_JSON_FALLBACK'];
const originalEnv = snapshotEnv(envKeys);

const getJson = mock(() => Promise.resolve(null));
const setJson = mock(() => Promise.resolve());
const del = mock(() => Promise.resolve());
const getAllMock = mock();
const usersGetDisciplinesMock = mock();
const sprintsGetAllMock = mock();
const sprintsGetNextMock = mock();
const currentStateGetMock = mock();

mock.module('../../cache/redisClient', () => ({
  getJson,
  setJson,
  del,
}));

mock.module('../../db/repository', () => ({
  UsersRepository: { getDisciplines: usersGetDisciplinesMock },
  SprintsRepository: {
    getAll: sprintsGetAllMock,
    getCurrentSprint: mock(),
    getNextSprint: sprintsGetNextMock,
  },
  CurrentStateRepository: { get: currentStateGetMock },
  OverridesRepository: { getAll: getAllMock },
}));

const dataUtilsPath = path.resolve(__dirname, '../../dataUtils.js');

function loadDataUtilsWithEnv({ overridesJsonFallback = undefined } = {}) {
  process.env.USE_DATABASE = 'true';
  process.env.DATABASE_URL = 'postgresql://test';
  process.env.OVERRIDES_SOURCE = '';
  if (overridesJsonFallback === undefined) {
    delete process.env.OVERRIDES_JSON_FALLBACK;
  } else {
    process.env.OVERRIDES_JSON_FALLBACK = overridesJsonFallback;
  }

  resetModuleCache([dataUtilsPath, '../../dataUtils']);
  return require(dataUtilsPath);
}

describe('dataUtils.readOverrides failure behavior', () => {
  beforeEach(() => {
    mock.clearAllMocks();
    getJson.mockResolvedValue(null);
    usersGetDisciplinesMock.mockResolvedValue({});
    sprintsGetAllMock.mockResolvedValue([]);
    sprintsGetNextMock.mockResolvedValue(null);
    currentStateGetMock.mockResolvedValue({
      sprintIndex: 0,
      account: null,
      producer: null,
      po: null,
      uiEng: null,
      beEng: null,
    });
  });

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  it('returns [] when repository fails and JSON fallback is disabled', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    getAllMock.mockRejectedValue(new Error('db unavailable'));

    const result = await dataUtils.readOverrides();

    expect(result).toEqual([]);
  });

  it('returns cached overrides and bypasses repository call when cache is warm', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    getJson.mockResolvedValueOnce([
      {
        sprintIndex: 1,
        role: 'po',
        originalSlackId: 'U_ORIG',
        newSlackId: 'U_NEW',
        approved: true,
      },
    ]);

    const result = await dataUtils.readOverrides();

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('po');
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it('falls back to JSON disciplines when repository throws', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    usersGetDisciplinesMock.mockRejectedValue(new Error('disciplines db unavailable'));

    const disciplines = await dataUtils.readDisciplines();

    expect(typeof disciplines).toBe('object');
  });

  it('falls back to JSON current state when repository throws', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    currentStateGetMock.mockRejectedValue(new Error('current state db unavailable'));

    const state = await dataUtils.readCurrentState();

    expect(state).toHaveProperty('sprintIndex');
    expect(state).toHaveProperty('po');
  });

  it('resolveCurrentSprintForNow picks old sprint before 8:00 AM PT on overlap day', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    const overlapSprints = [
      {
        sprintName: 'Sprint 10',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
        sprintIndex: 10,
      },
      {
        sprintName: 'Sprint 11',
        startDate: '2026-01-14',
        endDate: '2026-01-28',
        sprintIndex: 11,
      },
    ];
    const nowPT = dayjs.tz('2026-01-14T07:59:00', 'America/Los_Angeles');

    const result = dataUtils.resolveCurrentSprintForNow(overlapSprints, nowPT);

    expect(result).not.toBe(null);
    expect(result.index).toBe(10);
  });

  it('resolveCurrentSprintForNow picks new sprint at/after 8:00 AM PT on overlap day', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    const overlapSprints = [
      {
        sprintName: 'Sprint 10',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
        sprintIndex: 10,
      },
      {
        sprintName: 'Sprint 11',
        startDate: '2026-01-14',
        endDate: '2026-01-28',
        sprintIndex: 11,
      },
    ];
    const nowPT = dayjs.tz('2026-01-14T08:00:00', 'America/Los_Angeles');

    const result = dataUtils.resolveCurrentSprintForNow(overlapSprints, nowPT);

    expect(result).not.toBe(null);
    expect(result.index).toBe(11);
  });

  it('resolveCurrentSprintForNow keeps parity between DB-like and JSON-like sprint rows', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    const dbLikeRows = [
      {
        sprintName: 'Sprint 10',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-14T00:00:00.000Z'),
        sprintIndex: 10,
      },
      {
        sprintName: 'Sprint 11',
        startDate: new Date('2026-01-14T00:00:00.000Z'),
        endDate: new Date('2026-01-28T00:00:00.000Z'),
        sprintIndex: 11,
      },
    ];
    const jsonLikeRows = [
      {
        sprintName: 'Sprint 10',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
        sprintIndex: 10,
      },
      {
        sprintName: 'Sprint 11',
        startDate: '2026-01-14',
        endDate: '2026-01-28',
        sprintIndex: 11,
      },
    ];
    const nowPT = dayjs.tz('2026-01-14T08:00:00', 'America/Los_Angeles');

    const dbResult = dataUtils.resolveCurrentSprintForNow(dbLikeRows, nowPT);
    const jsonResult = dataUtils.resolveCurrentSprintForNow(jsonLikeRows, nowPT);

    expect(dbResult).not.toBe(null);
    expect(jsonResult).not.toBe(null);
    expect(dbResult.index).toBe(11);
    expect(jsonResult.index).toBe(11);
  });

  it('findNextSprint returns null cleanly when repository and fallback have no next sprint', async () => {
    const dataUtils = loadDataUtilsWithEnv({ overridesJsonFallback: undefined });
    sprintsGetNextMock.mockRejectedValue(new Error('next sprint query failed'));
    sprintsGetAllMock.mockResolvedValue([]);

    const next = await dataUtils.findNextSprint(999);

    expect(next).toBe(null);
  });
});

afterAll(() => {
  restoreAllMocks();
});
