const crypto = require('crypto');
const notificationSnapshotsRepository = require('../../repositories/notificationSnapshots');
const { findCurrentSprint, getSprintUsers } = require('../../dataUtils');
const { notifyRotationChanges } = require('../../slackNotifier');

async function getLatestSnapshot() {
  return notificationSnapshotsRepository.getLatestSnapshot();
}

async function saveSnapshot(snapshot) {
  return notificationSnapshotsRepository.insertNotificationSnapshot(snapshot);
}

async function recordCronTriggerAudit(auditInput) {
  return notificationSnapshotsRepository.insertCronTriggerAudit(auditInput);
}

async function updateCronTriggerResult(id, result, details) {
  return notificationSnapshotsRepository.updateCronTriggerAuditResult(id, result, details);
}

async function getCronTriggerAudit(id) {
  return notificationSnapshotsRepository.getCronTriggerAudit(id);
}

async function getNotificationAssignments() {
  const currentSprint = await findCurrentSprint();
  if (!currentSprint) {
    throw new Error('No active sprint found for notification generation');
  }
  const assignments = await getSprintUsers(currentSprint.index);
  return assignments;
}

async function getWeekendCarryover(previousAssignments, currentAssignments) {
  if (!previousAssignments || !currentAssignments) {
    return null;
  }
  const diff = diffAssignments(previousAssignments, currentAssignments);
  if (diff.length === 0) {
    return null;
  }
  return {
    diff,
    assignments: currentAssignments,
  };
}

function diffAssignments(previousAssignments = {}, currentAssignments = {}) {
  const roles = new Set([
    ...Object.keys(previousAssignments || {}),
    ...Object.keys(currentAssignments || {}),
  ]);

  const changes = [];
  roles.forEach((role) => {
    const oldUser = previousAssignments ? previousAssignments[role] : null;
    const newUser = currentAssignments ? currentAssignments[role] : null;
    if (oldUser !== newUser) {
      changes.push({ role, oldUser, newUser });
    }
  });

  return changes;
}

async function sendChangedNotifications(assignments, changes) {
  if (!changes || changes.length === 0) {
    return { sent: 0, message: 'No changes detected' };
  }

  const { sent } = await notifyRotationChanges(changes);
  return { sent, message: `${sent} notifications delivered for changed assignments.` };
}

function computeSnapshotHash(assignments = {}) {
  const ordered = Object.keys(assignments)
    .sort()
    .reduce((acc, key) => {
      acc[key] = assignments[key];
      return acc;
    }, {});
  const serialized = JSON.stringify(ordered);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Record a notification snapshot so the next Railway cron run matches hash and skips redundant Slack updates.
 * Safe to call when DATABASE_URL / notification_snapshots is unavailable (logs and returns null).
 * @param {Record<string, string|null|undefined>} assignments - discipline -> Slack user id map (same shape as getSprintUsers)
 */
async function recordAdminPreAlignedSnapshot(assignments) {
  if (!assignments || typeof assignments !== 'object') {
    return null;
  }
  try {
    const hash = computeSnapshotHash(assignments);
    return await saveSnapshot({
      disciplineAssignments: assignments,
      hash,
      deliveryStatus: 'skipped',
      deliveryReason: 'admin pre-aligned',
      railwayTriggerId: null,
    });
  } catch (err) {
    console.warn('[snapshotService] recordAdminPreAlignedSnapshot failed:', err?.message || err);
    return null;
  }
}

module.exports = {
  getLatestSnapshot,
  saveSnapshot,
  recordCronTriggerAudit,
  updateCronTriggerResult,
  getCronTriggerAudit,
  getNotificationAssignments,
  diffAssignments,
  sendChangedNotifications,
  computeSnapshotHash,
  getWeekendCarryover,
  recordAdminPreAlignedSnapshot,
};

