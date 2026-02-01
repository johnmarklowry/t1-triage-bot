const { describe, it, expect, mock, beforeEach, beforeAll } = require('bun:test');

const queryMock = mock();
const transactionMock = mock();

const connectionPath = require.resolve('../../db/connection');
const repositoryPath = require.resolve('../../db/repository');

// Reset before loading: clear cache and (re)apply our mocks so we get real repo + mocked connection.
// Must run before require('../../db/repository') so we override any db/repository mock from other tests.
function resetBeforeLoad() {
  if (typeof require.cache !== 'undefined') {
    delete require.cache[repositoryPath];
    delete require.cache[connectionPath];
  }
  mock.module(connectionPath, () => ({
    query: queryMock,
    transaction: transactionMock,
  }));
}

resetBeforeLoad();
// If another test (e.g. aaa-dataUtils) already mocked db/repository, we get that mock here.
// To guarantee real repo, run this file first: `bun test tests/unit/aaa-arepository.overrides.test.js`
// or use `bun run test` (see package.json).
const { OverridesRepository } = require('../../db/repository');

describe('OverridesRepository (mocked DB)', () => {
  beforeAll(() => {
    expect(OverridesRepository.getAll).toBeFunction();
    expect(OverridesRepository.deleteOverrideById).toBeFunction();
    expect(OverridesRepository.approveOverride).toBeFunction();
    expect(OverridesRepository.declineOverride).toBeFunction();
  });

  beforeEach(() => {
    mock.clearAllMocks();
  });

  describe('getAll', () => {
    it('returns overrides including approved', async () => {
      const rows = [
        {
          id: 1,
          sprint_index: 0,
          role: 'po',
          original_slack_id: null,
          replacement_slack_id: 'U2',
          replacement_name: 'Bob',
          requested_by: 'U1',
          approved: true,
          approved_by: 'U_ADMIN',
          approval_timestamp: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      queryMock.mockResolvedValue({ rows });

      const result = await OverridesRepository.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].approved).toBe(true);
      expect(result[0].sprintIndex).toBe(0);
    });
  });

  describe('deleteOverrideById', () => {
    it('deletes override by id and returns true', async () => {
      const overrideId = 42;
      const deletedBy = 'U_ADMIN';
      const oldRow = { id: overrideId, sprint_index: 0, role: 'po' };
      let selectCalled = false;
      let deleteCalled = false;
      transactionMock.mockImplementation(async (fn) => {
        const client = {
          query: mock(async (sql, params) => {
            if (sql.includes('SELECT')) {
              selectCalled = true;
              return { rows: [oldRow] };
            }
            if (sql.includes('DELETE')) {
              deleteCalled = true;
              return { rows: [] };
            }
            return { rows: [] };
          }),
        };
        return await fn(client);
      });

      const result = await OverridesRepository.deleteOverrideById(overrideId, deletedBy);

      expect(result).toBe(true);
      expect(selectCalled).toBe(true);
      expect(deleteCalled).toBe(true);
    });

    it('returns false when override not found', async () => {
      transactionMock.mockImplementation(async (fn) => {
        const client = {
          query: mock(async (sql) => {
            if (sql.includes('SELECT')) return { rows: [] };
            return { rows: [] };
          }),
        };
        return await fn(client);
      });

      const result = await OverridesRepository.deleteOverrideById(999, 'U_ADMIN');

      expect(result).toBe(false);
    });
  });

  describe('approveOverride', () => {
    it('updates row and returns override when found', async () => {
      const approvedRow = {
        id: 1,
        sprint_index: 0,
        role: 'po',
        approval_timestamp: new Date(),
      };
      transactionMock.mockImplementation(async (fn) => {
        const client = {
          query: mock(async (sql) => {
            if (sql.includes('UPDATE') && sql.includes('RETURNING')) {
              return { rows: [approvedRow] };
            }
            return { rows: [] };
          }),
        };
        return await fn(client);
      });

      const result = await OverridesRepository.approveOverride(
        0, 'po', 'U_REQ', 'U_REPLACE', 'U_ADMIN'
      );

      expect(result).toEqual(approvedRow);
    });
  });

  describe('declineOverride', () => {
    it('deletes unapproved override and returns true', async () => {
      const oldRow = { id: 1, sprint_index: 0, role: 'po', approved: false };
      transactionMock.mockImplementation(async (fn) => {
        const client = {
          query: mock(async (sql) => {
            if (sql.includes('SELECT')) return { rows: [oldRow] };
            if (sql.includes('DELETE')) return { rows: [] };
            return { rows: [] };
          }),
        };
        return await fn(client);
      });

      const result = await OverridesRepository.declineOverride(
        0, 'po', 'U_REQ', 'U_REPLACE', 'U_ADMIN'
      );

      expect(result).toBe(true);
    });
  });
});
