const { describe, it, expect, mock, beforeEach, afterAll } = require('bun:test');
const path = require('path');
const { resetModuleCache, restoreAllMocks } = require('../helpers/mockIsolation');

restoreAllMocks();

process.env.USE_DATABASE = 'true';
process.env.DATABASE_URL = 'postgresql://test';

const getJson = mock(() => Promise.resolve(null));
const setJson = mock(() => Promise.resolve());
const del = mock(() => Promise.resolve());
const queryMock = mock();
const transactionMock = mock(async (fn) => fn({ query: queryMock }));

mock.module('../../cache/redisClient', () => ({
  getJson,
  setJson,
  del,
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve()),
}));

mock.module('../../db/connection', () => ({
  query: queryMock,
  transaction: transactionMock,
}));

let usersRows = [];
let overridesRows = [];
let sprintRows = [];
let currentStateRows = [];

const dataUtilsPath = path.resolve(__dirname, '../../dataUtils.js');
resetModuleCache([dataUtilsPath, '../../dataUtils', '../../dataUtils.js']);
const dataUtils = require(dataUtilsPath);

describe('dataUtils release-team membership', () => {
  beforeEach(() => {
    mock.clearAllMocks();
    getJson.mockResolvedValue(null);
    usersRows = [];
    overridesRows = [];
    sprintRows = [];
    currentStateRows = [];
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM users')) return { rows: usersRows };
      if (sql.includes('FROM overrides')) return { rows: overridesRows };
      if (sql.includes('FROM sprints')) return { rows: sprintRows };
      if (sql.includes('FROM current_state')) return { rows: currentStateRows };
      return { rows: [] };
    });
  });

  it('includes only assignees flagged as onReleaseTeam', async () => {
    usersRows = [
      { discipline: 'account', slack_id: 'U_ACCOUNT', name: 'Account Owner', on_release_team: true },
      { discipline: 'producer', slack_id: 'U_PRODUCER', name: 'Producer Owner', on_release_team: false },
    ];

    const ids = await dataUtils.computeReleaseTeamUserIdsForSprint(0);
    expect(ids).toEqual(['U_ACCOUNT']);
  });

  it('dedupes repeated user IDs across multiple roles', async () => {
    usersRows = [
      { discipline: 'account', slack_id: 'U_SHARED', name: 'Shared Person', on_release_team: true },
      { discipline: 'producer', slack_id: 'U_SHARED', name: 'Shared Person', on_release_team: true },
    ];

    const ids = await dataUtils.computeReleaseTeamUserIdsForSprint(0);
    expect(ids).toEqual(['U_SHARED']);
  });
});

afterAll(() => {
  restoreAllMocks();
});
