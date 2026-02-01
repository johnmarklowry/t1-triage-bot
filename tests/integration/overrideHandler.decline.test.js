const { describe, it, expect, mock, beforeEach } = require('bun:test');

const declineOverrideMock = mock();
const postMessageMock = mock(() => Promise.resolve());
const updateMock = mock(() => Promise.resolve());

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
  readSprints: mock(() => Promise.resolve([])),
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
    declineOverride: declineOverrideMock,
    deleteOverrideById: mock(() => Promise.resolve(false)),
  },
}));

// Force fresh load so overrideHandler uses our mocks (avoids cache from other files)
if (typeof require.cache !== 'undefined') {
  delete require.cache[require.resolve('../../overrideHandler')];
}
const { handleDeclineOverride } = require('../../overrideHandler');

describe('overrideHandler decline_override', () => {
  const adminId = 'U_ADMIN';
  const requesterId = 'U_REQ';
  const replacementId = 'U_REPLACE';
  const sprintIndex = 0;

  let ackMock;
  let clientMock;
  let loggerMock;
  let body;

  beforeEach(() => {
    mock.clearAllMocks();
    declineOverrideMock.mockResolvedValue(true);
    ackMock = mock(() => Promise.resolve());
    clientMock = {
      chat: {
        postMessage: postMessageMock,
        update: updateMock,
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
            sprintIndex,
            role: 'po',
            requesterId,
            replacementSlackId: replacementId,
            replacementName: 'Bob',
          }),
        },
      ],
    };
  });

  it('calls ack', async () => {
    await handleDeclineOverride({
      ack: ackMock,
      body,
      client: clientMock,
      logger: loggerMock,
    });

    expect(ackMock).toHaveBeenCalledTimes(1);
  });

  it('calls declineOverride with correct args', async () => {
    await handleDeclineOverride({
      ack: ackMock,
      body,
      client: clientMock,
      logger: loggerMock,
    });

    expect(declineOverrideMock).toHaveBeenCalledTimes(1);
    expect(declineOverrideMock).toHaveBeenCalledWith(
      sprintIndex,
      'po',
      requesterId,
      replacementId,
      adminId
    );
  });

  it('calls client.chat.postMessage to requester when decline succeeds', async () => {
    await handleDeclineOverride({
      ack: ackMock,
      body,
      client: clientMock,
      logger: loggerMock,
    });

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: requesterId,
        text: expect.stringContaining('declined'),
      })
    );
  });

  it('calls client.chat.update for admin message when decline succeeds', async () => {
    await handleDeclineOverride({
      ack: ackMock,
      body,
      client: clientMock,
      logger: loggerMock,
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: body.channel.id,
        ts: body.message.ts,
        text: 'Override Declined',
      })
    );
  });
});
