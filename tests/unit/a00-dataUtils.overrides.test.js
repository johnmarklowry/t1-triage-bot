const { describe, it, expect, mock, beforeEach, afterAll } = require('bun:test');
const path = require('path');
const { resetModuleCache, restoreAllMocks } = require('../helpers/mockIsolation');
restoreAllMocks();

// Force dataUtils to use DB path so repository mocks are used
process.env.USE_DATABASE = 'true';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OVERRIDES_SOURCE = '';

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
let currentSprintRows = [];
let currentStateRows = [];

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function makeCurrentWindow() {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
}

// Force fresh load so dataUtils picks up our mocked db/repository (avoids cache from other test files)
const dataUtilsPath = path.resolve(__dirname, '../../dataUtils.js');
resetModuleCache([dataUtilsPath, '../../dataUtils', '../../dataUtils.js']);
const dataUtils = require(dataUtilsPath);

describe('dataUtils override/coverage', () => {
  beforeEach(() => {
    mock.clearAllMocks();
    getJson.mockResolvedValue(null);
    usersRows = [];
    overridesRows = [];
    currentSprintRows = [];
    currentStateRows = [];
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM users')) return { rows: usersRows };
      if (sql.includes('FROM overrides')) return { rows: overridesRows };
      if (sql.includes('FROM sprints')) return { rows: currentSprintRows };
      if (sql.includes('FROM current_state')) return { rows: currentStateRows };
      return { rows: [] };
    });
  });

  describe('getRoleAndDisciplinesForUser', () => {
    it('returns role and disciplines when user is in one discipline', async () => {
      usersRows = [
        { discipline: 'po', slack_id: 'U_PO_1', name: 'Alice' },
        { discipline: 'uiEng', slack_id: 'U_UI_1', name: 'Bob' },
      ];

      const result = await dataUtils.getRoleAndDisciplinesForUser('U_PO_1');

      expect(result.role).toBe('po');
      expect(result.disciplines).toEqual({
        po: [{ slackId: 'U_PO_1', name: 'Alice' }],
        uiEng: [{ slackId: 'U_UI_1', name: 'Bob' }],
      });
    });

    it('returns role null when user is in no discipline', async () => {
      usersRows = [{ discipline: 'po', slack_id: 'U_OTHER', name: 'Other' }];

      const result = await dataUtils.getRoleAndDisciplinesForUser('U_NOT_FOUND');

      expect(result.role).toBe(null);
      expect(result.disciplines).toEqual({
        po: [{ slackId: 'U_OTHER', name: 'Other' }],
      });
    });

    it('returns role null and empty object when disciplines is empty', async () => {
      usersRows = [];

      const result = await dataUtils.getRoleAndDisciplinesForUser('U_ANY');

      expect(result.role).toBe(null);
      expect(result.disciplines).toEqual({});
    });
  });

  describe('getSprintUsers with usePersistedForCurrentSprint', () => {
    it('returns calculated roles from overrides when usePersistedForCurrentSprint is false', async () => {
      const { startDate, endDate } = makeCurrentWindow();
      currentSprintRows = [{
        sprint_name: 'T1',
        start_date: startDate,
        end_date: endDate,
        sprint_index: 0,
      }];
      usersRows = [
        { discipline: 'po', slack_id: 'U_ORIG', name: 'Orig' },
        { discipline: 'po', slack_id: 'U_REPLACE', name: 'Replace' },
      ];
      overridesRows = [
        {
          id: 1,
          sprint_index: 0,
          role: 'po',
          original_slack_id: 'U_ORIG',
          replacement_slack_id: 'U_REPLACE',
          replacement_name: 'Replace',
          requested_by: 'U_REQ',
          approved: true,
        },
      ];

      const result = await dataUtils.getSprintUsers(0, { usePersistedForCurrentSprint: false });

      expect(result.po).toBe('U_REPLACE');
    });

    it('returns persisted state for current sprint when usePersistedForCurrentSprint is true (default)', async () => {
      const { startDate, endDate } = makeCurrentWindow();
      currentSprintRows = [{
        sprint_name: 'T1',
        start_date: startDate,
        end_date: endDate,
        sprint_index: 0,
      }];
      currentStateRows = [{
        sprint_index: 0,
        account_slack_id: null,
        producer_slack_id: null,
        po_slack_id: 'U_PERSISTED',
        ui_eng_slack_id: null,
        be_eng_slack_id: null,
      }];
      getJson
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await dataUtils.getSprintUsers(0);

      expect(result.po).toBe('U_PERSISTED');
    });
  });
});

afterAll(() => {
  restoreAllMocks();
});
