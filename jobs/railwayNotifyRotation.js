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

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function logRailway(level, message, meta = {}) {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'railway-notify-job',
    ...meta,
  };
  const output = JSON.stringify(line);
  if (level === 'error') {
    console.error(output);
    return;
  }
  if (level === 'warn') {
    console.warn(output);
    return;
  }
  console.log(output);
}

function assignmentsToUserIds(assignments = {}) {
  const ids = Object.values(assignments).filter(Boolean);
  return [...new Set(ids)];
}

async function handleRailwayNotification(payload = {}) {
  const startedAtMs = Date.now();
  const triggerId = payload.trigger_id || crypto.randomUUID();
  logRailway('info', 'railway notification handler started', {
    trigger_id: triggerId,
    payload: safeJson(payload),
  });

  // Correct persisted sprint index by date so current_state stays in sync when calendar moves into a new sprint
  const stateWasRefreshed = await refreshCurrentState();

  const existingAudit = await getCronTriggerAudit(triggerId);
  if (existingAudit && existingAudit.result && existingAudit.result !== 'pending') {
    logRailway('info', 'railway notification idempotent hit', {
      trigger_id: triggerId,
      result: existingAudit.result,
      elapsed_ms: Date.now() - startedAtMs,
    });
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
    logRailway('info', 'railway notification deferred', {
      trigger_id: triggerId,
      snapshot_id: snapshot.id,
      next_delivery: snapshot.nextDelivery,
      elapsed_ms: Date.now() - startedAtMs,
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
    logRailway('info', 'railway notification skipped', {
      trigger_id: triggerId,
      snapshot_id: snapshot.id,
      reason: 'rotation unchanged',
      elapsed_ms: Date.now() - startedAtMs,
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

  logRailway('info', 'railway notification delivered', {
    trigger_id: triggerId,
    snapshot_id: snapshot.id,
    notifications_sent: deliveryResult.sent,
    state_was_refreshed: stateWasRefreshed,
    elapsed_ms: Date.now() - startedAtMs,
  });

  return {
    result: 'delivered',
    notifications_sent: deliveryResult.sent,
    snapshot_id: snapshot.id,
  };
}

module.exports = {
  handleRailwayNotification,
};

