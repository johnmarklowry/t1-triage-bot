const { describe, it, expect, mock, beforeEach } = require('bun:test');

const findCurrentSprintMock = mock();
const readCurrentStateMock = mock();
const getSprintUsersMock = mock();
const saveCurrentStateMock = mock();
const notifyRotationChangesMock = mock();
const updateOnCallUserGroupMock = mock();
const updateChannelTopicMock = mock();
const notifyAdminsMock = mock();

mock.module('../../dataUtils', () => ({
  readCurrentState: readCurrentStateMock,
  saveCurrentState: saveCurrentStateMock,
  readOverrides: mock(() => Promise.resolve([])),
  getSprintUsers: getSprintUsersMock,
  findCurrentSprint: findCurrentSprintMock,
  findNextSprint: mock(() => Promise.resolve(null)),
  formatPTDate: mock(() => ''),
  parsePTDate: mock(() => null),
  getTodayPT: mock(() => ({})),
  refreshCurrentState: mock(() => Promise.resolve(false)),
}));

mock.module('../../slackNotifier', () => ({
  notifyUser: mock(() => Promise.resolve()),
  notifyAdmins: notifyAdminsMock,
  updateOnCallUserGroup: updateOnCallUserGroupMock,
  updateChannelTopic: updateChannelTopicMock,
  notifyRotationChanges: notifyRotationChangesMock,
}));

// Force fresh load so triageLogic uses our mocked dataUtils/slackNotifier (avoids cache from other files)
const triageLogicPath = require.resolve('../../triageLogic');
if (typeof require.cache !== 'undefined') {
  delete require.cache[triageLogicPath];
}
const { applyCurrentSprintRotation, setCurrentSprintRolesFromAdmin } = require('../../triageLogic');

describe('triageLogic override/rotation', () => {
  beforeEach(() => {
    mock.clearAllMocks();
    findCurrentSprintMock.mockResolvedValue({ index: 0 });
    readCurrentStateMock.mockResolvedValue({
      sprintIndex: 0,
      account: null,
      producer: null,
      po: 'U1',
      uiEng: null,
      beEng: null,
    });
    getSprintUsersMock.mockResolvedValue({
      sprintIndex: 0,
      account: null,
      producer: null,
      po: 'U2',
      uiEng: null,
      beEng: null,
    });
    saveCurrentStateMock.mockResolvedValue(true);
  });

  describe('applyCurrentSprintRotation', () => {
    it('returns updated: true and affectedUserIds when roles change', async () => {
      const result = await applyCurrentSprintRotation();

      expect(result).toEqual({ updated: true, affectedUserIds: expect.any(Array) });
      expect(result.affectedUserIds).toContain('U1');
      expect(result.affectedUserIds).toContain('U2');
      expect(notifyRotationChangesMock).toHaveBeenCalledTimes(1);
      expect(updateOnCallUserGroupMock).toHaveBeenCalledTimes(1);
      expect(updateChannelTopicMock).toHaveBeenCalledTimes(1);
      expect(saveCurrentStateMock).toHaveBeenCalledTimes(1);
      expect(getSprintUsersMock).toHaveBeenCalledWith(0, { usePersistedForCurrentSprint: false });
    });

    it('returns updated: false when roles match current state', async () => {
      getSprintUsersMock.mockResolvedValue({
        sprintIndex: 0,
        account: null,
        producer: null,
        po: 'U1',
        uiEng: null,
        beEng: null,
      });

      const result = await applyCurrentSprintRotation();

      expect(result).toEqual({ updated: false, affectedUserIds: [] });
      expect(notifyRotationChangesMock).not.toHaveBeenCalled();
      expect(saveCurrentStateMock).not.toHaveBeenCalled();
    });

    it('returns updated: false when no current sprint', async () => {
      findCurrentSprintMock.mockResolvedValue(null);

      const result = await applyCurrentSprintRotation();

      expect(result).toEqual({ updated: false, affectedUserIds: [] });
      expect(getSprintUsersMock).not.toHaveBeenCalled();
    });
  });

  describe('setCurrentSprintRolesFromAdmin', () => {
    it('returns updated: true and affectedUserIds when newRoles differ from oldState', async () => {
      readCurrentStateMock.mockResolvedValue({
        sprintIndex: 0,
        account: null,
        producer: null,
        po: 'U1',
        uiEng: null,
        beEng: null,
      });

      const result = await setCurrentSprintRolesFromAdmin({
        account: null,
        producer: null,
        po: 'U2',
        uiEng: null,
        beEng: null,
      });

      expect(result).toEqual({ updated: true, affectedUserIds: expect.any(Array) });
      expect(result.affectedUserIds).toContain('U1');
      expect(result.affectedUserIds).toContain('U2');
      expect(notifyRotationChangesMock).toHaveBeenCalledTimes(1);
      expect(updateOnCallUserGroupMock).toHaveBeenCalledTimes(1);
      expect(updateChannelTopicMock).toHaveBeenCalledTimes(1);
      expect(saveCurrentStateMock).toHaveBeenCalledTimes(1);
    });

    it('returns updated: false when newRoles match current state', async () => {
      readCurrentStateMock.mockResolvedValue({
        sprintIndex: 0,
        account: null,
        producer: null,
        po: 'U1',
        uiEng: null,
        beEng: null,
      });

      const result = await setCurrentSprintRolesFromAdmin({
        account: null,
        producer: null,
        po: 'U1',
        uiEng: null,
        beEng: null,
      });

      expect(result).toEqual({ updated: false, affectedUserIds: [] });
      expect(notifyRotationChangesMock).not.toHaveBeenCalled();
      expect(saveCurrentStateMock).not.toHaveBeenCalled();
    });

    it('returns updated: false when no current sprint', async () => {
      findCurrentSprintMock.mockResolvedValue(null);

      const result = await setCurrentSprintRolesFromAdmin({ po: 'U2' });

      expect(result).toEqual({ updated: false, affectedUserIds: [] });
      expect(readCurrentStateMock).not.toHaveBeenCalled();
    });
  });
});
