const { describe, it, expect, mock, beforeEach } = require('bun:test');

process.env.RAILWAY_CRON_SECRET = 'test-secret';

const getCronTriggerAudit = mock(() => Promise.resolve(null));
const recordCronTriggerAudit = mock(() => Promise.resolve({}));
const updateCronTriggerResult = mock(() => Promise.resolve({}));
const saveSnapshot = mock(() => Promise.resolve({ id: 42 }));
const computeSnapshotHash = mock(() => 'hash-value');
const getNotificationAssignments = mock();
const getLatestSnapshot = mock();
const diffAssignments = mock();
const sendChangedNotifications = mock();
const getWeekendCarryover = mock(() => Promise.resolve(null));

mock.module('../../services/notifications/snapshotService', () => ({
  getCronTriggerAudit,
  recordCronTriggerAudit,
  updateCronTriggerResult,
  saveSnapshot,
  computeSnapshotHash,
  getNotificationAssignments,
  getLatestSnapshot,
  diffAssignments,
  sendChangedNotifications,
  getWeekendCarryover,
}));

const notifyUser = mock(() => Promise.resolve());
mock.module('../../slackNotifier', () => ({
  notifyUser,
  notifyAdmins: mock(() => Promise.resolve()),
  updateOnCallUserGroup: mock(() => Promise.resolve()),
  updateChannelTopic: mock(() => Promise.resolve()),
  notifyRotationChanges: mock(() => Promise.resolve()),
}));

mock.module('../../services/notifications/weekdayPolicy', () => ({
  shouldDeferNotification: () => false,
  nextBusinessDay: (d) => d,
}));

const request = require('supertest');
const express = require('express');
const railwayCronRouter = require('../../routes/railwayCron');

describe('POST /railway/notify-rotation', () => {
  const app = express();
  app.use(express.json());
  app.use('/jobs', railwayCronRouter);

  beforeEach(() => {
    mock.clearAllMocks();
    getCronTriggerAudit.mockResolvedValue(null);
    recordCronTriggerAudit.mockResolvedValue({});
    updateCronTriggerResult.mockResolvedValue({});
    saveSnapshot.mockResolvedValue({ id: 42 });
    computeSnapshotHash.mockReturnValue('hash-value');
  });

  it('rejects requests without a valid signature when secret configured', async () => {
    await request(app).post('/jobs/railway/notify-rotation').expect(401);
  });

  it('skips notification when assignments hash matches latest snapshot', async () => {
    getNotificationAssignments.mockResolvedValue({
      account: 'U1',
      producer: 'U2',
    });
    getLatestSnapshot.mockResolvedValue({
      hash: 'hash-value',
      disciplineAssignments: {
        account: 'U1',
        producer: 'U2',
      },
    });

    const response = await request(app)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'abc-123',
        scheduled_at: '2025-11-10T16:00:00Z',
      })
      .expect(202);

    expect(response.body.result).toBe('skipped');
    expect(response.body.notifications_sent).toBe(0);
    expect(response.body.snapshot_id).toBe(42);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('delivers notifications when assignments change', async () => {
    getNotificationAssignments.mockResolvedValue({
      account: 'U1',
      producer: 'U3',
    });
    getLatestSnapshot.mockResolvedValue({
      hash: 'different',
      disciplineAssignments: {
        account: 'U1',
        producer: 'U2',
      },
    });
    diffAssignments.mockReturnValue([
      { role: 'producer', oldUser: 'U2', newUser: 'U3' },
    ]);
    sendChangedNotifications.mockResolvedValue({
      sent: 2,
      message: 'notifications sent',
    });

    const response = await request(app)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'def-456',
        scheduled_at: '2025-11-10T16:00:00Z',
      })
      .expect(202);

    expect(response.body.result).toBe('delivered');
    expect(response.body.notifications_sent).toBe(2);
    expect(response.body.snapshot_id).toBe(42);
    expect(saveSnapshot).toHaveBeenCalled();
  });
});
