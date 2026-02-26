const { describe, it, expect, mock, beforeEach, afterAll } = require('bun:test');
const path = require('path');
const { resetModuleCache, restoreAllMocks } = require('../helpers/mockIsolation');

restoreAllMocks();

const findCurrentSprintMock = mock();
const findNextSprintMock = mock();
const readCurrentStateMock = mock();
const getSprintUsersMock = mock();
const saveCurrentStateMock = mock();
const formatPTDateMock = mock(() => '01/14/2026');
const parsePTDateMock = mock(() => ({}));
const getTodayPTMock = mock(() => ({ isSame: () => true }));
const refreshCurrentStateMock = mock(() => Promise.resolve(false));

const notifyUserMock = mock(() => Promise.resolve());
const notifyAdminsMock = mock(() => Promise.resolve());
const updateOnCallUserGroupMock = mock(() => Promise.resolve());
const updateChannelTopicMock = mock(() => Promise.resolve());

mock.module('../../dataUtils', () => ({
  readCurrentState: readCurrentStateMock,
  saveCurrentState: saveCurrentStateMock,
  readOverrides: mock(() => Promise.resolve([])),
  getSprintUsers: getSprintUsersMock,
  findCurrentSprint: findCurrentSprintMock,
  findNextSprint: findNextSprintMock,
  formatPTDate: formatPTDateMock,
  parsePTDate: parsePTDateMock,
  getTodayPT: getTodayPTMock,
  refreshCurrentState: refreshCurrentStateMock,
}));

mock.module('../../slackNotifier', () => ({
  notifyUser: notifyUserMock,
  notifyAdmins: notifyAdminsMock,
  updateOnCallUserGroup: updateOnCallUserGroupMock,
  updateChannelTopic: updateChannelTopicMock,
  notifyRotationChanges: mock(() => Promise.resolve()),
}));

const triageLogicPath = path.resolve(__dirname, '../../triageLogic.js');
resetModuleCache([triageLogicPath, '../../triageLogic']);
const { run8amCheck, run5pmCheck } = require(triageLogicPath);

describe('triageLogic scheduler critical paths', () => {
  beforeEach(() => {
    mock.clearAllMocks();

    readCurrentStateMock.mockResolvedValue({
      sprintIndex: 0,
      account: 'U_OLD_ACCOUNT',
      producer: null,
      po: 'U_OLD_PO',
      uiEng: null,
      beEng: null,
    });

    findCurrentSprintMock.mockResolvedValue({
      index: 1,
      sprintName: 'Sprint 2',
      endDate: '2026-01-14',
    });

    getSprintUsersMock.mockResolvedValue({
      account: 'U_NEW_ACCOUNT',
      producer: null,
      po: 'U_NEW_PO',
      uiEng: null,
      beEng: null,
    });

    saveCurrentStateMock.mockResolvedValue(true);
    findNextSprintMock.mockResolvedValue({ index: 1, sprintName: 'Sprint 2' });
  });

  it('run8amCheck transitions sprint and synchronizes Slack + persisted state', async () => {
    await run8amCheck();

    expect(updateOnCallUserGroupMock).toHaveBeenCalledWith(
      expect.arrayContaining(['U_NEW_ACCOUNT', 'U_NEW_PO'])
    );
    expect(updateChannelTopicMock).toHaveBeenCalledWith(
      expect.arrayContaining(['U_NEW_ACCOUNT', 'U_NEW_PO'])
    );
    expect(saveCurrentStateMock).toHaveBeenCalledWith({
      sprintIndex: 1,
      account: 'U_NEW_ACCOUNT',
      producer: null,
      po: 'U_NEW_PO',
      uiEng: null,
      beEng: null,
    });
  });

  it('run5pmCheck sends handoff notifications on sprint end day', async () => {
    findCurrentSprintMock.mockResolvedValue({
      index: 0,
      sprintName: 'Sprint 1',
      endDate: '2026-01-14',
    });

    findNextSprintMock.mockResolvedValue({ index: 1, sprintName: 'Sprint 2' });

    getSprintUsersMock.mockImplementation(async (index) => {
      if (index === 0) {
        return {
          account: 'U_OLD_ACCOUNT',
          producer: null,
          po: 'U_OLD_PO',
          uiEng: null,
          beEng: null,
        };
      }
      return {
        account: 'U_NEW_ACCOUNT',
        producer: null,
        po: 'U_NEW_PO',
        uiEng: null,
        beEng: null,
      };
    });

    await run5pmCheck();

    expect(notifyUserMock).toHaveBeenCalled();
    expect(notifyUserMock).toHaveBeenCalledWith(
      'U_OLD_ACCOUNT',
      expect.stringContaining('shift ends tomorrow')
    );
    expect(notifyUserMock).toHaveBeenCalledWith(
      'U_NEW_ACCOUNT',
      expect.stringContaining('start #lcom-bug-triage duty tomorrow')
    );
  });

  it('run8amCheck exits cleanly when no current sprint is found', async () => {
    findCurrentSprintMock.mockResolvedValue(null);

    await run8amCheck();

    expect(getSprintUsersMock).not.toHaveBeenCalled();
    expect(updateOnCallUserGroupMock).not.toHaveBeenCalled();
    expect(updateChannelTopicMock).not.toHaveBeenCalled();
    expect(saveCurrentStateMock).not.toHaveBeenCalled();
  });

  it('run8amCheck does not mutate state when mid-cycle roles are unchanged', async () => {
    readCurrentStateMock.mockResolvedValue({
      sprintIndex: 0,
      account: 'U_SAME_ACCOUNT',
      producer: null,
      po: 'U_SAME_PO',
      uiEng: null,
      beEng: null,
    });
    findCurrentSprintMock.mockResolvedValue({
      index: 0,
      sprintName: 'Sprint 1',
      endDate: '2026-01-14',
    });
    getSprintUsersMock.mockResolvedValue({
      account: 'U_SAME_ACCOUNT',
      producer: null,
      po: 'U_SAME_PO',
      uiEng: null,
      beEng: null,
    });

    await run8amCheck();

    expect(updateOnCallUserGroupMock).not.toHaveBeenCalled();
    expect(updateChannelTopicMock).not.toHaveBeenCalled();
    expect(saveCurrentStateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it('run5pmCheck exits when next sprint is unavailable', async () => {
    findCurrentSprintMock.mockResolvedValue({
      index: 0,
      sprintName: 'Sprint 1',
      endDate: '2026-01-14',
    });
    findNextSprintMock.mockResolvedValue(null);

    await run5pmCheck();

    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it('run8amCheck notifies admins when unexpected error occurs', async () => {
    findCurrentSprintMock.mockRejectedValue(new Error('boom'));

    await run8amCheck();

    expect(notifyAdminsMock).toHaveBeenCalledWith(expect.stringContaining('[8AM Check] Error: boom'));
  });

  it('run8amCheck transitions once at overlap cutover and does not re-transition on rerun', async () => {
    readCurrentStateMock
      .mockResolvedValueOnce({
        sprintIndex: 10,
        account: 'U_OLD_ACCOUNT',
        producer: null,
        po: 'U_OLD_PO',
        uiEng: null,
        beEng: null,
      })
      .mockResolvedValueOnce({
        sprintIndex: 11,
        account: 'U_NEW_ACCOUNT',
        producer: null,
        po: 'U_NEW_PO',
        uiEng: null,
        beEng: null,
      });
    findCurrentSprintMock
      .mockResolvedValueOnce({
        index: 11,
        sprintName: 'Sprint 11',
        endDate: '2026-01-28',
      })
      .mockResolvedValueOnce({
        index: 11,
        sprintName: 'Sprint 11',
        endDate: '2026-01-28',
      });
    getSprintUsersMock.mockResolvedValue({
      account: 'U_NEW_ACCOUNT',
      producer: null,
      po: 'U_NEW_PO',
      uiEng: null,
      beEng: null,
    });

    await run8amCheck();
    await run8amCheck();

    expect(saveCurrentStateMock).toHaveBeenCalledTimes(1);
    expect(updateOnCallUserGroupMock).toHaveBeenCalledTimes(1);
    expect(updateChannelTopicMock).toHaveBeenCalledTimes(1);
  });

  it('run5pmCheck sends no handoff when already on new sprint after cutover day', async () => {
    getTodayPTMock.mockReturnValue({ isSame: () => false });
    findCurrentSprintMock.mockResolvedValue({
      index: 11,
      sprintName: 'Sprint 11',
      endDate: '2026-01-28',
    });

    await run5pmCheck();

    expect(findNextSprintMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  restoreAllMocks();
});
