const { describe, it, expect, mock, beforeEach } = require('bun:test');

const findCurrentSprintMock = mock();
const getSprintUsersMock = mock();
const applyCurrentSprintRotationMock = mock();
const publishAppHomeForUserMock = mock();

mock.module('../../loadEnv', () => ({ loadEnv: () => {} }));
mock.module('../../appHome', () => ({
  slackApp: { action: () => {}, view: () => {}, command: () => {}, shortcut: () => {}, options: () => {} },
  receiver: {},
  publishAppHomeForUser: publishAppHomeForUserMock,
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
  findCurrentSprint: findCurrentSprintMock,
  getSprintUsers: getSprintUsersMock,
  readSprints: mock(() => Promise.resolve([])),
  getRoleAndDisciplinesForUser: mock(() => Promise.resolve({ role: null, disciplines: {} })),
}));
mock.module('../../triageLogic', () => ({
  applyCurrentSprintRotation: applyCurrentSprintRotationMock,
}));
mock.module('../../services/adminMembership', () => ({
  isUserInAdminChannel: mock(() => Promise.resolve(false)),
  DEFAULT_TTL_MS: 60000,
}));
mock.module('../../db/repository', () => ({
  UsersRepository: { getDisciplines: mock(() => Promise.resolve({})) },
  OverridesRepository: {
    getAll: mock(() => Promise.resolve([])),
    approveOverride: mock(() => Promise.resolve({ id: 1, approvalTimestamp: new Date().toISOString() })),
    declineOverride: mock(() => Promise.resolve(false)),
    deleteOverrideById: mock(() => Promise.resolve(false)),
  },
}));

// Force fresh load so overrideHandler uses our mocked triageLogic/appHome
if (typeof require.cache !== 'undefined') {
  delete require.cache[require.resolve('../../overrideHandler')];
}
const { handleApproveOverride } = require('../../overrideHandler');

describe('overrideHandler approve_override', () => {
  const adminId = 'U_ADMIN';
  const requesterId = 'U_REQ';
  const replacementId = 'U_REPLACE';
  const currentSprintIndex = 0;

  let ackMock;
  let clientMock;
  let loggerMock;
  let body;

  beforeEach(() => {
    mock.clearAllMocks();
    ackMock = mock(() => Promise.resolve());
    clientMock = {
      chat: {
        postMessage: mock(() => Promise.resolve()),
        update: mock(() => Promise.resolve()),
      },
    };
    loggerMock = { error: mock(() => {}) };
    body = {
      user: { id: adminId },
      channel: { id: 'C_CHAN' },
      message: { ts: '123.456' },
      actions: [
        {
          value: JSON.stringify({
            sprintIndex: currentSprintIndex,
            role: 'po',
            requesterId,
            replacementSlackId: replacementId,
            replacementName: 'Bob',
          }),
        },
      ],
    };
    findCurrentSprintMock.mockResolvedValue({ index: currentSprintIndex });
    getSprintUsersMock.mockResolvedValue({
      account: null,
      producer: null,
      po: replacementId,
      uiEng: null,
      beEng: null,
    });
    applyCurrentSprintRotationMock.mockResolvedValue({
      updated: true,
      affectedUserIds: ['U_OLD', replacementId],
    });
  });

  it('calls applyCurrentSprintRotation once when override affects current sprint', async () => {
    await handleApproveOverride({
      ack: ackMock,
      body,
      client: clientMock,
      logger: loggerMock,
    });

    expect(applyCurrentSprintRotationMock).toHaveBeenCalledTimes(1);
  });

  it('calls publishAppHomeForUser for each affected user and admin when updated', async () => {
    await handleApproveOverride({
      ack: ackMock,
      body,
      client: clientMock,
      logger: loggerMock,
    });

    expect(publishAppHomeForUserMock).toHaveBeenCalledWith(clientMock, expect.any(String));
    const calledUserIds = publishAppHomeForUserMock.mock.calls.map((c) => c[1]);
    expect(calledUserIds).toContain(adminId);
    expect(calledUserIds).toContain(replacementId);
    expect(calledUserIds).toContain('U_OLD');
  });
});
