const { describe, it, expect, mock, beforeEach } = require('bun:test');
const path = require('path');
const { resetModuleCache } = require('../helpers/mockIsolation');

const findCurrentSprintMock = mock();
const readCurrentStateMock = mock();
const getSprintUsersMock = mock();
const saveCurrentStateMock = mock(() => Promise.resolve());
const recordAlignMock = mock(() => Promise.resolve({ id: 1 }));
const cacheDelMock = mock(() => Promise.resolve());
const updateOnCallUserGroupMock = mock(() => Promise.resolve());
const updateChannelTopicMock = mock(() => Promise.resolve());

mock.module('../../dataUtils', () => ({
  readCurrentState: readCurrentStateMock,
  saveCurrentState: saveCurrentStateMock,
  getSprintUsers: getSprintUsersMock,
  findCurrentSprint: findCurrentSprintMock,
  readOverrides: mock(() => Promise.resolve([])),
}));

mock.module('../../slackNotifier', () => ({
  notifyUser: mock(() => Promise.resolve()),
  notifyAdmins: mock(() => Promise.resolve()),
  updateOnCallUserGroup: updateOnCallUserGroupMock,
  updateChannelTopic: updateChannelTopicMock,
  notifyRotationChanges: mock(() => Promise.resolve()),
}));

mock.module('../../services/notifications/snapshotService', () => ({
  recordAdminPreAlignedSnapshot: recordAlignMock,
}));

mock.module('../../cache/redisClient', () => ({
  del: cacheDelMock,
}));

const triageLogicPath = path.resolve(__dirname, '../../triageLogic.js');
resetModuleCache([triageLogicPath]);
const { reconcileCurrentStateAfterUserDeactivated } = require(triageLogicPath);

describe('reconcileCurrentStateAfterUserDeactivated', () => {
  beforeEach(() => {
    mock.clearAllMocks();
  });

  it('returns reconciled false when deactivated user is not in current_state', async () => {
    findCurrentSprintMock.mockResolvedValue({ index: 2 });
    readCurrentStateMock.mockResolvedValue({
      sprintIndex: 2,
      account: 'U111',
      producer: null,
      po: null,
      uiEng: null,
      beEng: null,
    });
    const r = await reconcileCurrentStateAfterUserDeactivated('U999');
    expect(r.reconciled).toBe(false);
    expect(saveCurrentStateMock).not.toHaveBeenCalled();
    expect(recordAlignMock).not.toHaveBeenCalled();
  });

  it('recomputes roles, saves state, clears cache, and aligns snapshot when user is on-call', async () => {
    findCurrentSprintMock.mockResolvedValue({ index: 2 });
    readCurrentStateMock.mockResolvedValue({
      sprintIndex: 2,
      account: 'UOLD',
      producer: null,
      po: null,
      uiEng: null,
      beEng: null,
    });
    const newRoles = {
      account: 'UNEW',
      producer: null,
      po: null,
      uiEng: null,
      beEng: null,
    };
    getSprintUsersMock.mockResolvedValue(newRoles);

    const r = await reconcileCurrentStateAfterUserDeactivated('UOLD');
    expect(r.reconciled).toBe(true);
    expect(getSprintUsersMock).toHaveBeenCalledWith(2, { usePersistedForCurrentSprint: false });
    expect(saveCurrentStateMock).toHaveBeenCalled();
    expect(cacheDelMock).toHaveBeenCalledWith('sprintUsers:2');
    expect(updateOnCallUserGroupMock).toHaveBeenCalledWith(['UNEW']);
    expect(updateChannelTopicMock).toHaveBeenCalledWith(['UNEW']);
    expect(recordAlignMock).toHaveBeenCalledWith(newRoles);
  });
});
