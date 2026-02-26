const { describe, it, expect, mock, beforeEach, afterAll } = require('bun:test');
const path = require('path');
const { resetModuleCache, restoreAllMocks } = require('../helpers/mockIsolation');
restoreAllMocks();

const queryMock = mock();
const transactionMock = mock();

// Clear cache so we load real repository with our connection mock (avoids cached repo from other files)
const repositoryPath = path.resolve(__dirname, '../../db/repository.js');
resetModuleCache([repositoryPath, '../../db/repository', '../../db/connection']);

mock.module('../../db/connection', () => ({
  query: queryMock,
  transaction: transactionMock,
}));

const { OverridesRepository, SprintsRepository } = require(repositoryPath);

describe('OverridesRepository (mocked DB)', () => {
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

describe('SprintsRepository overlap selection (mocked DB)', () => {
  beforeEach(() => {
    mock.clearAllMocks();
  });

  it('uses deterministic descending index order for overlap-day current sprint query', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          sprint_name: 'Sprint 11',
          start_date: '2026-01-14',
          end_date: '2026-01-28',
          sprint_index: 11,
        },
        {
          sprint_name: 'Sprint 10',
          start_date: '2026-01-01',
          end_date: '2026-01-14',
          sprint_index: 10,
        },
      ],
    });

    const result = await SprintsRepository.getCurrentSprint(new Date('2026-01-14T12:00:00.000Z'));

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY sprint_index DESC'),
      [expect.any(Date)]
    );
    expect(result).not.toBe(null);
    expect(result.index).toBe(11);
  });
});

afterAll(() => {
  restoreAllMocks();
});
