process.env.RAILWAY_CRON_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const snapshotService = require('../../services/notifications/snapshotService');
const slackNotifier = require('../../slackNotifier');

jest.mock('../../services/notifications/snapshotService');
jest.mock('../../slackNotifier');

const railwayCronRouter = require('../../routes/railwayCron');

describe('POST /railway/notify-rotation', () => {
  const app = express();
  app.use('/jobs', railwayCronRouter);

  beforeEach(() => {
    jest.resetAllMocks();
    snapshotService.getCronTriggerAudit.mockResolvedValue(null);
    snapshotService.recordCronTriggerAudit.mockResolvedValue({});
    snapshotService.updateCronTriggerResult.mockResolvedValue({});
    snapshotService.saveSnapshot.mockResolvedValue({ id: 42 });
    snapshotService.computeSnapshotHash.mockReturnValue('hash-value');
  });

  it('rejects requests without a valid signature when secret configured', async () => {
    await request(app).post('/jobs/railway/notify-rotation').expect(401);
  });

  it('skips notification when assignments hash matches latest snapshot', async () => {
    snapshotService.getNotificationAssignments.mockResolvedValue({
      account: 'U1',
      producer: 'U2',
    });
    snapshotService.getLatestSnapshot.mockResolvedValue({
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
    expect(response.body.notificationsSent).toBe(0);
    expect(response.body.snapshotId).toBe(42);
    expect(slackNotifier.notifyUser).not.toHaveBeenCalled();
  });

  it('delivers notifications when assignments change', async () => {
    snapshotService.getNotificationAssignments.mockResolvedValue({
      account: 'U1',
      producer: 'U3',
    });
    snapshotService.getLatestSnapshot.mockResolvedValue({
      hash: 'different',
      disciplineAssignments: {
        account: 'U1',
        producer: 'U2',
      },
    });
    snapshotService.diffAssignments.mockReturnValue([
      { role: 'producer', oldUser: 'U2', newUser: 'U3' },
    ]);
    snapshotService.sendChangedNotifications.mockResolvedValue({
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
    expect(response.body.notificationsSent).toBe(2);
    expect(response.body.snapshotId).toBe(42);
    expect(snapshotService.saveSnapshot).toHaveBeenCalled();
  });
});

