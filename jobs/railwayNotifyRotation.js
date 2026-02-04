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
const { notifyAdmins, updateOnCallUserGroup, updateChannelTopic } = require('../slackNotifier');
const { refreshCurrentState } = require('../dataUtils');

function assignmentsToUserIds(assignments = {}) {
  const ids = Object.values(assignments).filter(Boolean);
  return [...new Set(ids)];
}

async function handleRailwayNotification(payload = {}) {
  const triggerId = payload.trigger_id || crypto.randomUUID();

  // Correct persisted sprint index by date so current_state stays in sync when calendar moves into a new sprint
  const stateWasRefreshed = await refreshCurrentState();

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
    if (stateWasRefreshed) {
      const userIdsDef = assignmentsToUserIds(assignments);
      if (userIdsDef.length > 0) {
        await updateOnCallUserGroup(userIdsDef);
        await updateChannelTopic(userIdsDef);
      }
    }
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
  // Only notify add/remove when sprint start (stateWasRefreshed); avoid re-notifying after an admin update
  const deliveryResult = stateWasRefreshed
    ? await sendChangedNotifications(assignments, changes)
    : { sent: 0, message: 'No notifications (change was not sprint start)' };

  // Update Slack usergroup and channel topic whenever assignments changed (delivered path), so mid-sprint admin changes are reflected
  const userIds = assignmentsToUserIds(assignments);
  if (userIds.length > 0) {
    await updateOnCallUserGroup(userIds);
    await updateChannelTopic(userIds);
  }

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

