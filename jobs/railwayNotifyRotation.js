const crypto = require('crypto');
const {
  recordCronTriggerAudit,
  updateCronTriggerResult,
  getCronTriggerAudit,
  getLatestSnapshot,
  saveSnapshot,
  getNotificationAssignments,
  diffAssignments,
  sendChangedNotifications,
  computeSnapshotHash,
  getWeekendCarryover,
} = require('../services/notifications/snapshotService');
const { shouldDeferNotification, nextBusinessDay } = require('../services/notifications/weekdayPolicy');
const { notifyAdmins } = require('../slackNotifier');

async function handleRailwayNotification(payload = {}) {
  const triggerId = payload.trigger_id || crypto.randomUUID();

  const existingAudit = await getCronTriggerAudit(triggerId);
  if (existingAudit && existingAudit.result && existingAudit.result !== 'pending') {
    return {
      result: existingAudit.result,
      notifications_sent: existingAudit.details?.notifications_sent || 0,
      snapshot_id: existingAudit.details?.snapshot_id || null,
    };
  }

  if (!existingAudit) {
    await recordCronTriggerAudit({
      id: triggerId,
      triggeredAt: new Date(),
      scheduledAt: payload.scheduled_at ? new Date(payload.scheduled_at) : null,
      result: 'pending',
      details: payload,
    });
  }

  const scheduledTime = payload.scheduled_at ? new Date(payload.scheduled_at) : new Date();
  const assignments = await getNotificationAssignments();
  const hash = computeSnapshotHash(assignments);
  const latestSnapshot = await getLatestSnapshot();

  if (shouldDeferNotification(scheduledTime)) {
    const snapshot = await saveSnapshot({
      disciplineAssignments: assignments,
      hash,
      deliveryStatus: 'deferred',
      deliveryReason: 'weekend defer',
      railwayTriggerId: triggerId,
      nextDelivery: nextBusinessDay(scheduledTime),
    });
    await updateCronTriggerResult(triggerId, 'deferred', {
      snapshot_id: snapshot.id,
      notifications_sent: 0,
      nextDelivery: snapshot.nextDelivery,
    });
    return {
      result: 'deferred',
      notifications_sent: 0,
      snapshot_id: snapshot.id,
      nextDelivery: snapshot.nextDelivery,
    };
  }

  if (latestSnapshot && latestSnapshot.hash === hash) {
    const snapshot = await saveSnapshot({
      disciplineAssignments: assignments,
      hash,
      deliveryStatus: 'skipped',
      deliveryReason: 'rotation unchanged',
      railwayTriggerId: triggerId,
    });
    await updateCronTriggerResult(triggerId, 'skipped', {
      snapshot_id: snapshot.id,
      notifications_sent: 0,
    });
    return {
      result: 'skipped',
      notifications_sent: 0,
      snapshot_id: snapshot.id,
    };
  }

  const changes = diffAssignments(
    latestSnapshot ? latestSnapshot.disciplineAssignments : {},
    assignments
  );
  const deliveryResult = await sendChangedNotifications(assignments, changes);
  const snapshot = await saveSnapshot({
    disciplineAssignments: assignments,
    hash,
    deliveryStatus: 'delivered',
    deliveryReason: deliveryResult.message || null,
    railwayTriggerId: triggerId,
  });

  await updateCronTriggerResult(triggerId, 'delivered', {
    snapshot_id: snapshot.id,
    notifications_sent: deliveryResult.sent,
  });

  if (latestSnapshot && latestSnapshot.deliveryStatus === 'deferred') {
    const carryover = await getWeekendCarryover(
      latestSnapshot.disciplineAssignments,
      assignments
    );
    if (carryover) {
      await notifyAdmins(
        `[Railway Cron] Weekend changes summarized: ${JSON.stringify(carryover.diff)}`
      );
    }
  }

  return {
    result: 'delivered',
    notifications_sent: deliveryResult.sent,
    snapshot_id: snapshot.id,
  };
}

module.exports = {
  handleRailwayNotification,
};

