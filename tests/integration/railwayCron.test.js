const { describe, it, expect, mock, beforeEach, beforeAll, afterAll } = require('bun:test');

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
const updateOnCallUserGroupMock = mock(() => Promise.resolve());
const updateChannelTopicMock = mock(() => Promise.resolve());
mock.module('../../slackNotifier', () => ({
  notifyUser,
  notifyAdmins: mock(() => Promise.resolve()),
  updateOnCallUserGroup: updateOnCallUserGroupMock,
  updateChannelTopic: updateChannelTopicMock,
  notifyRotationChanges: mock(() => Promise.resolve()),
}));

const refreshCurrentStateMock = mock(() => Promise.resolve(false));
mock.module('../../dataUtils', () => ({
  refreshCurrentState: refreshCurrentStateMock,
}));

let shouldDeferNotificationReturn = false;
mock.module('../../services/notifications/weekdayPolicy', () => ({
  shouldDeferNotification: () => shouldDeferNotificationReturn,
  nextBusinessDay: (d) => d,
}));

const request = require('supertest');
const express = require('express');
const http = require('http');
const railwayCronRouter = require('../../routes/railwayCron');

describe('POST /railway/notify-rotation', () => {
  const app = express();
  app.use(express.json());
  app.use('/jobs', railwayCronRouter);
  const server = http.createServer(app);
  let baseUrl;

  beforeAll((done) => {
    server.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    mock.clearAllMocks();
    shouldDeferNotificationReturn = false;
    getCronTriggerAudit.mockResolvedValue(null);
    recordCronTriggerAudit.mockResolvedValue({});
    updateCronTriggerResult.mockResolvedValue({});
    saveSnapshot.mockResolvedValue({ id: 42 });
    computeSnapshotHash.mockReturnValue('hash-value');
    refreshCurrentStateMock.mockResolvedValue(false);
  });

  function expectAcceptedContract(response, expectedResult) {
    expect(response.body).toHaveProperty('status', 'accepted');
    expect(response.body).toHaveProperty('result', expectedResult);
    expect(response.body).toHaveProperty('snapshot_id');
  }

  it('rejects requests without a valid signature when secret configured', async () => {
    const response = await request(baseUrl).post('/jobs/railway/notify-rotation').expect(401);
    expect(response.body).toEqual({
      status: 'unauthorized',
      message: 'Invalid Railway cron signature',
    });
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

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'abc-123',
        scheduled_at: '2025-11-10T16:00:00Z',
      })
      .expect(202);

    expectAcceptedContract(response, 'skipped');
    expect(response.body.notifications_sent).toBe(0);
    expect(response.body.snapshot_id).toBe(42);
    expect(notifyUser).not.toHaveBeenCalled();
    expect(updateOnCallUserGroupMock).not.toHaveBeenCalled();
    expect(updateChannelTopicMock).not.toHaveBeenCalled();
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

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'def-456',
        scheduled_at: '2025-11-10T16:00:00Z',
      })
      .expect(202);

    expectAcceptedContract(response, 'delivered');
    expect(response.body.notifications_sent).toBe(0);
    expect(response.body.snapshot_id).toBe(42);
    expect(saveSnapshot).toHaveBeenCalled();
    expect(updateOnCallUserGroupMock).toHaveBeenCalled();
    expect(updateChannelTopicMock).toHaveBeenCalled();
  });

  it('delivered: updates usergroup/topic and notifies when state was refreshed (sprint start)', async () => {
    refreshCurrentStateMock.mockResolvedValue(true);
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

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'delivered-refreshed',
        scheduled_at: '2025-11-10T16:00:00Z',
      })
      .expect(202);

    expectAcceptedContract(response, 'delivered');
    expect(updateOnCallUserGroupMock).toHaveBeenCalled();
    expect(updateChannelTopicMock).toHaveBeenCalled();
  });

  it('overlap cutover: refreshed state on 8AM PT boundary triggers delivered synchronization', async () => {
    refreshCurrentStateMock.mockResolvedValue(true);
    getNotificationAssignments.mockResolvedValue({
      account: 'U_OLD',
      producer: 'U_NEW',
    });
    getLatestSnapshot.mockResolvedValue({
      hash: 'different',
      disciplineAssignments: {
        account: 'U_OLD',
        producer: 'U_OLD_PRODUCER',
      },
    });
    diffAssignments.mockReturnValue([
      { role: 'producer', oldUser: 'U_OLD_PRODUCER', newUser: 'U_NEW' },
    ]);
    sendChangedNotifications.mockResolvedValue({
      sent: 1,
      message: 'notifications sent',
    });

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'overlap-cutover-8am',
        scheduled_at: '2026-01-14T16:00:00Z',
      })
      .expect(202);

    expectAcceptedContract(response, 'delivered');
    expect(refreshCurrentStateMock).toHaveBeenCalledTimes(1);
    expect(updateOnCallUserGroupMock).toHaveBeenCalled();
    expect(updateChannelTopicMock).toHaveBeenCalled();
  });

  it('deferred: does not update usergroup/topic when state was not refreshed', async () => {
    shouldDeferNotificationReturn = true;
    getNotificationAssignments.mockResolvedValue({
      account: 'U1',
      producer: 'U2',
    });
    refreshCurrentStateMock.mockResolvedValue(false);
    saveSnapshot.mockResolvedValue({
      id: 42,
      nextDelivery: '2025-11-11T16:00:00.000Z',
    });

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'defer-no-refresh',
        scheduled_at: '2025-11-10T16:00:00Z',
      })
      .expect(202);

    expectAcceptedContract(response, 'deferred');
    expect(response.body).toHaveProperty('nextDelivery');
    expect(updateOnCallUserGroupMock).not.toHaveBeenCalled();
    expect(updateChannelTopicMock).not.toHaveBeenCalled();
  });

  it('deferred: updates usergroup/topic when state was refreshed', async () => {
    shouldDeferNotificationReturn = true;
    getNotificationAssignments.mockResolvedValue({
      account: 'U1',
      producer: 'U2',
    });
    refreshCurrentStateMock.mockResolvedValue(true);
    saveSnapshot.mockResolvedValue({
      id: 42,
      nextDelivery: '2025-11-11T16:00:00.000Z',
    });

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({
        trigger_id: 'defer-refreshed',
        scheduled_at: '2025-11-10T16:00:00Z',
      })
      .expect(202);

    expectAcceptedContract(response, 'deferred');
    expect(response.body).toHaveProperty('nextDelivery');
    expect(updateOnCallUserGroupMock).toHaveBeenCalled();
    expect(updateChannelTopicMock).toHaveBeenCalled();
  });

  it('returns 400 for primitive JSON payload (strict parser validation)', async () => {
    await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .set('Content-Type', 'application/json')
      .send('"just-a-string-payload"')
      .expect(400);
  });

  it('returns 400 for malformed JSON payload (parser-level validation)', async () => {
    await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .set('Content-Type', 'application/json')
      .send('{bad-json')
      .expect(400);
  });

  it('returns 500 and message when handleRailwayNotification throws', async () => {
    getNotificationAssignments.mockRejectedValue(new Error('job failed'));

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({ trigger_id: 'err-1', scheduled_at: '2025-11-10T16:00:00Z' })
      .expect(500);

    expect(response.body.status).toBe('error');
    expect(response.body.message).toBe('job failed');
  });

  it('replays idempotent result when trigger audit already completed', async () => {
    getCronTriggerAudit.mockResolvedValue({
      id: 'trigger-replay-1',
      result: 'delivered',
      details: {
        notifications_sent: 3,
        snapshot_id: 999,
      },
    });

    const response = await request(baseUrl)
      .post('/jobs/railway/notify-rotation')
      .set('X-Railway-Cron-Signature', 'test-secret')
      .send({ trigger_id: 'trigger-replay-1', scheduled_at: '2025-11-10T16:00:00Z' })
      .expect(202);

    expectAcceptedContract(response, 'delivered');
    expect(response.body.notifications_sent).toBe(3);
    expect(response.body.snapshot_id).toBe(999);
    expect(getNotificationAssignments).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(updateOnCallUserGroupMock).not.toHaveBeenCalled();
    expect(updateChannelTopicMock).not.toHaveBeenCalled();
    expect(recordCronTriggerAudit).not.toHaveBeenCalled();
    expect(updateCronTriggerResult).not.toHaveBeenCalled();
  });
});
