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

const { railwayNotifyRotationHandler } = require('../../routes/railwayCron');

function makeReq(opts = {}) {
  const headers = opts.headers || {};
  return {
    get(name) {
      return headers[name] || headers[name.toLowerCase()];
    },
    body: opts.body || {},
  };
}

function makeRes() {
  let statusCode;
  let body;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(obj) {
      body = obj;
      return this;
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

describe('POST /railway/notify-rotation', () => {
  beforeEach(() => {
    mock.clearAllMocks();
    getCronTriggerAudit.mockResolvedValue(null);
    recordCronTriggerAudit.mockResolvedValue({});
    updateCronTriggerResult.mockResolvedValue({});
    saveSnapshot.mockResolvedValue({ id: 42 });
    computeSnapshotHash.mockReturnValue('hash-value');
  });

  it('rejects requests without a valid signature when secret configured', async () => {
    const req = makeReq();
    const res = makeRes();
    await railwayNotifyRotationHandler(req, res);
    expect(res.getStatus()).toBe(401);
    expect(res.getBody().status).toBe('unauthorized');
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

    const req = makeReq({
      headers: { 'X-Railway-Cron-Signature': 'test-secret' },
      body: { trigger_id: 'abc-123', scheduled_at: '2025-11-10T16:00:00Z' },
    });
    const res = makeRes();
    await railwayNotifyRotationHandler(req, res);

    expect(res.getStatus()).toBe(202);
    expect(res.getBody().result).toBe('skipped');
    expect(res.getBody().notifications_sent).toBe(0);
    expect(res.getBody().snapshot_id).toBe(42);
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

    const req = makeReq({
      headers: { 'X-Railway-Cron-Signature': 'test-secret' },
      body: { trigger_id: 'def-456', scheduled_at: '2025-11-10T16:00:00Z' },
    });
    const res = makeRes();
    await railwayNotifyRotationHandler(req, res);

    expect(res.getStatus()).toBe(202);
    expect(res.getBody().result).toBe('delivered');
    expect(res.getBody().notifications_sent).toBe(2);
    expect(res.getBody().snapshot_id).toBe(42);
    expect(saveSnapshot).toHaveBeenCalled();
  });

  it('returns 500 and message when handleRailwayNotification throws', async () => {
    getNotificationAssignments.mockRejectedValue(new Error('job failed'));

    const req = makeReq({
      headers: { 'X-Railway-Cron-Signature': 'test-secret' },
      body: { trigger_id: 'err-1', scheduled_at: '2025-11-10T16:00:00Z' },
    });
    const res = makeRes();
    await railwayNotifyRotationHandler(req, res);

    expect(res.getStatus()).toBe(500);
    expect(res.getBody().status).toBe('error');
    expect(res.getBody().message).toBe('job failed');
  });
});
