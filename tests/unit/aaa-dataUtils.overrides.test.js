const { describe, it, expect, mock, beforeEach } = require('bun:test');

// Force dataUtils to use DB path so repository mocks are used
process.env.USE_DATABASE = 'true';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OVERRIDES_SOURCE = '';

const getJson = mock(() => Promise.resolve(null));
const setJson = mock(() => Promise.resolve());
const del = mock(() => Promise.resolve());

mock.module('../../cache/redisClient', () => ({
  getJson,
  setJson,
  del,
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve()),
}));

const getDisciplinesMock = mock();
const getAllOverridesMock = mock();
const getCurrentSprintMock = mock();

mock.module('../../db/repository', () => ({
  UsersRepository: {
    getDisciplines: getDisciplinesMock,
    getAllUsers: mock(() => Promise.resolve([])),
  },
  SprintsRepository: {
    getAll: mock(() => Promise.resolve([])),
    getCurrentSprint: getCurrentSprintMock,
    getNextSprint: mock(() => Promise.resolve(null)),
  },
  CurrentStateRepository: {
    get: mock(() => Promise.resolve(null)),
    upsert: mock(() => Promise.resolve()),
  },
  OverridesRepository: {
    getAll: getAllOverridesMock,
  },
}));

// Force fresh load so we get real dataUtils with our db/repository mock (avoid cached dataUtils from other tests)
const dataUtilsPath = require.resolve('../../dataUtils');
if (typeof require.cache !== 'undefined') {
  delete require.cache[dataUtilsPath];
}
const dataUtils = require(dataUtilsPath);

describe('dataUtils override/coverage', () => {
  beforeEach(() => {
    mock.clearAllMocks();
    getJson.mockResolvedValue(null);
  });

  describe('getRoleAndDisciplinesForUser', () => {
    it('returns role and disciplines when user is in one discipline', async () => {
      const disciplines = {
        po: [{ slackId: 'U_PO_1', name: 'Alice' }],
        uiEng: [{ slackId: 'U_UI_1', name: 'Bob' }],
      };
      getDisciplinesMock.mockResolvedValue(disciplines);

      const result = await dataUtils.getRoleAndDisciplinesForUser('U_PO_1');

      expect(result.role).toBe('po');
      expect(result.disciplines).toEqual(disciplines);
    });

    it('returns role null when user is in no discipline', async () => {
      const disciplines = { po: [{ slackId: 'U_OTHER', name: 'Other' }] };
      getDisciplinesMock.mockResolvedValue(disciplines);

      const result = await dataUtils.getRoleAndDisciplinesForUser('U_NOT_FOUND');

      expect(result.role).toBe(null);
      expect(result.disciplines).toEqual(disciplines);
    });

    it('returns role null and empty object when disciplines is empty', async () => {
      getDisciplinesMock.mockResolvedValue({});

      const result = await dataUtils.getRoleAndDisciplinesForUser('U_ANY');

      expect(result.role).toBe(null);
      expect(result.disciplines).toEqual({});
    });
  });

  describe('getSprintUsers with usePersistedForCurrentSprint', () => {
    it('returns calculated roles from overrides when usePersistedForCurrentSprint is false', async () => {
      getCurrentSprintMock.mockResolvedValue({ index: 0 });
      getDisciplinesMock.mockResolvedValue({
        po: [{ slackId: 'U_ORIG', name: 'Orig' }, { slackId: 'U_REPLACE', name: 'Replace' }],
      });
      getAllOverridesMock.mockResolvedValue([
        {
          sprintIndex: 0,
          role: 'po',
          newSlackId: 'U_REPLACE',
          approved: true,
        },
      ]);

      const result = await dataUtils.getSprintUsers(0, { usePersistedForCurrentSprint: false });

      expect(result.po).toBe('U_REPLACE');
    });

    it('returns persisted state for current sprint when usePersistedForCurrentSprint is true (default)', async () => {
      getCurrentSprintMock.mockResolvedValue({ index: 0 });
      getJson
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          sprintIndex: 0,
          account: null,
          producer: null,
          po: 'U_PERSISTED',
          uiEng: null,
          beEng: null,
        });

      const result = await dataUtils.getSprintUsers(0);

      expect(result.po).toBe('U_PERSISTED');
    });
  });
});
