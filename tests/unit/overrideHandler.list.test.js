const { describe, it, expect, mock, afterAll } = require('bun:test');

const readSprintsMock = mock(() =>
  Promise.resolve([
    { sprintIndex: 0, sprintName: 'T1 Sprint 1', startDate: '2026-01-01', endDate: '2026-01-14' },
  ])
);

mock.module('../../loadEnv', () => ({ loadEnv: () => {} }));
mock.module('../../appHome', () => ({
  slackApp: { action: () => {}, view: () => {}, command: () => {}, shortcut: () => {}, options: () => {} },
  receiver: {},
  publishAppHomeForUser: mock(() => Promise.resolve()),
}));
mock.module('../../commandUtils', () => ({ getEnvironmentCommand: (name) => name }));
mock.module('../../cache/redisClient', () => ({
  get: mock(() => Promise.resolve(null)),
  set: mock(() => Promise.resolve()),
  getJson: mock(() => Promise.resolve(null)),
  setJson: mock(() => Promise.resolve()),
  del: mock(() => Promise.resolve()),
}));
mock.module('../../dataUtils', () => ({
  findCurrentSprint: mock(() => Promise.resolve(null)),
  getSprintUsers: mock(() => Promise.resolve({})),
  readSprints: readSprintsMock,
  getRoleAndDisciplinesForUser: mock(() => Promise.resolve({ role: null, disciplines: {} })),
}));
mock.module('../../triageLogic', () => ({ applyCurrentSprintRotation: mock(() => Promise.resolve({ updated: false, affectedUserIds: [] })) }));
mock.module('../../services/adminMembership', () => ({
  isUserInAdminChannel: mock(() => Promise.resolve(false)),
  DEFAULT_TTL_MS: 60000,
}));
mock.module('../../db/repository', () => ({
  UsersRepository: { getDisciplines: mock(() => Promise.resolve({})) },
  OverridesRepository: {
    getAll: mock(() => Promise.resolve([])),
    approveOverride: mock(() => Promise.resolve(null)),
    declineOverride: mock(() => Promise.resolve(false)),
    deleteOverrideById: mock(() => Promise.resolve(false)),
  },
}));

const { buildOverrideListModal } = require('../../overrideHandler');

describe('overrideHandler buildOverrideListModal', () => {
  it('includes sprint label (name or date range) in modal blocks', async () => {
    const overrides = [
      {
        sprintIndex: 0,
        role: 'po',
        requestedBy: 'U1',
        newSlackId: 'U2',
        newName: 'Bob',
        approved: true,
      },
    ];
    const modal = await buildOverrideListModal(overrides);

    expect(modal.blocks).toBeDefined();
    expect(modal.blocks.length).toBeGreaterThan(0);
    const sectionTexts = modal.blocks
      .filter((b) => b.type === 'section' && b.text?.text)
      .map((b) => b.text.text);
    const hasSprintLabel = sectionTexts.some(
      (t) =>
        t.includes('T1 Sprint 1') ||
        t.includes('2026-01-01') ||
        (t.includes('Sprint:') && !t.includes('Sprint Index:'))
    );
    expect(hasSprintLabel).toBe(true);
  });

  it('returns empty state when overrides is empty', async () => {
    const modal = await buildOverrideListModal([]);
    expect(modal.blocks).toBeDefined();
    const noOverrides = modal.blocks.some(
      (b) => b.text?.text === 'No overrides found.'
    );
    expect(noOverrides).toBe(true);
  });
});

afterAll(() => {
  mock.restore();
});
