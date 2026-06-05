const { describe, it, expect, mock, beforeEach, afterEach } = require('bun:test');
const { resetModuleCache, restoreEnv, snapshotEnv } = require('../helpers/mockIsolation');

const addUserMock = mock(() => Promise.resolve(1));
const deactivateUserMock = mock(() => Promise.resolve(true));
const reactivateUserMock = mock(() => Promise.resolve(true));
const setDisciplineRotationOrderMock = mock(() => Promise.resolve(true));
const cacheDelMock = mock(() => Promise.resolve());
const reconcileMock = mock(() => Promise.resolve({ reconciled: true }));

mock.module('../../db/repository', () => ({
  UsersRepository: {
    addUser: addUserMock,
    deactivateUser: deactivateUserMock,
    reactivateUser: reactivateUserMock,
    setDisciplineRotationOrder: setDisciplineRotationOrderMock,
  },
}));

mock.module('../../cache/redisClient', () => ({
  del: cacheDelMock,
}));

mock.module('../../triageLogic', () => ({
  reconcileCurrentStateAfterUserDeactivated: reconcileMock,
}));

mock.module('../../services/adminViews', () => ({
  getDisciplinesSourceFile: () => '/tmp/disciplines.test.json',
}));

const savedJson = {};
mock.module('../../dataUtils', () => ({
  loadJSON: (file) => savedJson[file] || {},
  saveJSON: (file, data) => {
    savedJson[file] = JSON.parse(JSON.stringify(data));
    return true;
  },
}));

function loadParticipants() {
  resetModuleCache(['../../services/adminWebParticipants']);
  return require('../../services/adminWebParticipants');
}

describe('adminWebParticipants', () => {
  const envSnap = snapshotEnv(['USE_DATABASE', 'DATABASE_URL']);

  beforeEach(() => {
    addUserMock.mockClear();
    deactivateUserMock.mockClear();
    reactivateUserMock.mockClear();
    setDisciplineRotationOrderMock.mockClear();
    cacheDelMock.mockClear();
    reconcileMock.mockClear();
    delete savedJson['/tmp/disciplines.test.json'];
    process.env.USE_DATABASE = 'true';
    process.env.DATABASE_URL = 'postgres://test';
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  it('addParticipant validates discipline and slack ID', async () => {
    const { addParticipant } = loadParticipants();
    await expect(addParticipant({ discipline: 'invalid', slackId: 'U123' }))
      .rejects.toThrow('Invalid discipline');
    await expect(addParticipant({ discipline: 'po', slackId: 'bad' }))
      .rejects.toThrow('Invalid Slack user ID');
  });

  it('addParticipant persists via UsersRepository in database mode', async () => {
    const { addParticipant } = loadParticipants();
    const result = await addParticipant({ discipline: 'po', slackId: 'UABC123', name: 'Pat' });
    expect(addUserMock).toHaveBeenCalledWith('UABC123', 'Pat', 'po', 'web-admin');
    expect(cacheDelMock).toHaveBeenCalledWith('disciplines:all');
    expect(result).toEqual({ discipline: 'po', slackId: 'UABC123', name: 'Pat', active: true });
  });

  it('deactivateParticipant reconciles current sprint state', async () => {
    const { deactivateParticipant } = loadParticipants();
    const result = await deactivateParticipant({ slackId: 'UABC123' });
    expect(deactivateUserMock).toHaveBeenCalled();
    expect(reconcileMock).toHaveBeenCalledWith('UABC123');
    expect(result.reconciled).toBe(true);
  });

  it('reorderParticipants updates rotation order in database mode', async () => {
    const { reorderParticipants } = loadParticipants();
    const slackIds = ['U1', 'U2', 'U3'];
    const result = await reorderParticipants({ discipline: 'account', slackIds });
    expect(setDisciplineRotationOrderMock).toHaveBeenCalledWith('account', slackIds, 'web-admin');
    expect(result.slackIds).toEqual(slackIds);
  });

  it('reorderParticipants writes JSON array order when database disabled', async () => {
    process.env.USE_DATABASE = 'false';
    delete process.env.DATABASE_URL;
    savedJson['/tmp/disciplines.test.json'] = {
      account: [
        { slackId: 'U1', name: 'One', active: true },
        { slackId: 'U2', name: 'Two', active: true },
      ],
    };
    const { reorderParticipants } = loadParticipants();
    await reorderParticipants({ discipline: 'account', slackIds: ['U2', 'U1'] });
    expect(savedJson['/tmp/disciplines.test.json'].account.map((m) => m.slackId)).toEqual(['U2', 'U1']);
    expect(setDisciplineRotationOrderMock).not.toHaveBeenCalled();
  });
});
