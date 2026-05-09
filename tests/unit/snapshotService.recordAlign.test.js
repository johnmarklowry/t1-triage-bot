const { describe, it, expect, mock, beforeEach } = require('bun:test');
const path = require('path');
const { resetModuleCache } = require('../helpers/mockIsolation');

const insertNotificationSnapshotMock = mock(() =>
  Promise.resolve({ id: 99, hash: 'abc' })
);

mock.module('../../repositories/notificationSnapshots', () => ({
  insertNotificationSnapshot: insertNotificationSnapshotMock,
  getLatestSnapshot: mock(() => Promise.resolve(null)),
  insertCronTriggerAudit: mock(() => Promise.resolve({})),
  updateCronTriggerAuditResult: mock(() => Promise.resolve({})),
  getCronTriggerAudit: mock(() => Promise.resolve(null)),
}));

const findCurrentSprintMock = mock();
const getSprintUsersMock = mock();

mock.module('../../dataUtils', () => ({
  findCurrentSprint: findCurrentSprintMock,
  getSprintUsers: getSprintUsersMock,
  readCurrentState: mock(() => Promise.resolve({})),
  saveCurrentState: mock(() => Promise.resolve()),
  readOverrides: mock(() => Promise.resolve([])),
}));

mock.module('../../slackNotifier', () => ({
  notifyRotationChanges: mock(() => Promise.resolve({ sent: 0 })),
}));

const snapshotServicePath = path.resolve(__dirname, '../../services/notifications/snapshotService.js');
resetModuleCache([snapshotServicePath]);
const { recordAdminPreAlignedSnapshot, computeSnapshotHash } = require(snapshotServicePath);

describe('recordAdminPreAlignedSnapshot', () => {
  beforeEach(() => {
    mock.clearAllMocks();
  });

  it('inserts skipped snapshot with admin pre-aligned reason and stable hash', async () => {
    const assignments = {
      account: 'UA',
      producer: 'UP',
      po: null,
      uiEng: null,
      beEng: null,
    };
    await recordAdminPreAlignedSnapshot(assignments);

    expect(insertNotificationSnapshotMock).toHaveBeenCalledTimes(1);
    const arg = insertNotificationSnapshotMock.mock.calls[0][0];
    expect(arg.deliveryStatus).toBe('skipped');
    expect(arg.deliveryReason).toBe('admin pre-aligned');
    expect(arg.railwayTriggerId).toBeNull();
    expect(arg.hash).toBe(computeSnapshotHash(assignments));
    expect(arg.disciplineAssignments).toEqual(assignments);
  });

  it('returns null and does not throw when insert fails', async () => {
    insertNotificationSnapshotMock.mockRejectedValueOnce(new Error('no table'));
    const out = await recordAdminPreAlignedSnapshot({ account: 'U1' });
    expect(out).toBeNull();
  });
});
