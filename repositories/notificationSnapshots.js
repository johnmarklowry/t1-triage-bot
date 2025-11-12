const { query } = require('../db/connection');

/**
 * Insert a Railway cron trigger audit entry.
 * @param {Object} params
 * @param {string} params.id - UUID provided by Railway webhook.
 * @param {Date | string} [params.triggeredAt] - Timestamp when the trigger executed.
 * @param {Date | string} [params.scheduledAt] - Scheduled execution time from Railway payload.
 * @param {string} params.result - Initial result state.
 * @param {Object} [params.details] - Additional metadata captured as JSON.
 * @returns {Promise<Object>} Inserted audit row.
 */
async function insertCronTriggerAudit({
  id,
  triggeredAt = new Date(),
  scheduledAt = null,
  result,
  details = null,
}) {
  const res = await query(
    `
      INSERT INTO cron_trigger_audits (id, triggered_at, scheduled_at, result, details)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [id, triggeredAt, scheduledAt, result, details]
  );

  return mapAuditRow(res.rows[0]);
}

/**
 * Update the outcome of an existing cron trigger audit.
 */
async function updateCronTriggerAuditResult(id, result, details = null) {
  const res = await query(
    `
      UPDATE cron_trigger_audits
      SET result = $2,
          details = COALESCE($3, details),
          triggered_at = COALESCE(triggered_at, CURRENT_TIMESTAMP)
      WHERE id = $1
      RETURNING *
    `,
    [id, result, details]
  );

  return res.rows.length ? mapAuditRow(res.rows[0]) : null;
}

/**
 * Fetch a cron trigger audit row by id.
 */
async function getCronTriggerAudit(id) {
  const res = await query(
    `SELECT * FROM cron_trigger_audits WHERE id = $1`,
    [id]
  );

  return res.rows.length ? mapAuditRow(res.rows[0]) : null;
}

/**
 * Persist a notification snapshot.
 * @param {Object} params
 * @param {Object} params.disciplineAssignments - Hash map of discipline -> user.
 * @param {string} params.hash - Deterministic hash of notification payload.
 * @param {string} params.deliveryStatus - delivered|skipped|deferred
 * @param {string} [params.deliveryReason]
 * @param {string} [params.railwayTriggerId]
 * @param {Date | string} [params.nextDelivery]
 * @returns {Promise<Object>} Inserted snapshot row.
 */
async function insertNotificationSnapshot({
  disciplineAssignments,
  hash,
  deliveryStatus,
  deliveryReason = null,
  railwayTriggerId = null,
  nextDelivery = null,
}) {
  const res = await query(
    `
      INSERT INTO notification_snapshots (
        discipline_assignments,
        hash,
        delivery_status,
        delivery_reason,
        railway_trigger_id,
        next_delivery
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      disciplineAssignments,
      hash,
      deliveryStatus,
      deliveryReason,
      railwayTriggerId,
      nextDelivery,
    ]
  );

  return mapSnapshotRow(res.rows[0]);
}

/**
 * Fetch the most recent notification snapshot.
 */
async function getLatestSnapshot() {
  const res = await query(
    `
      SELECT *
      FROM notification_snapshots
      ORDER BY captured_at DESC
      LIMIT 1
    `
  );

  return res.rows.length ? mapSnapshotRow(res.rows[0]) : null;
}

/**
 * Fetch a snapshot by hash value.
 */
async function getSnapshots(limit = 10) {
  const res = await query(
    `
      SELECT *
      FROM notification_snapshots
      ORDER BY captured_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return res.rows.map(mapSnapshotRow);
}

/**
 * Map DB audit row to camelCase object.
 */
function mapAuditRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    triggeredAt: row.triggered_at,
    scheduledAt: row.scheduled_at,
    result: row.result,
    details: row.details,
    createdAt: row.created_at,
  };
}

/**
 * Map DB snapshot row to camelCase object.
 */
function mapSnapshotRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    capturedAt: row.captured_at,
    disciplineAssignments: row.discipline_assignments,
    hash: row.hash,
    deliveryStatus: row.delivery_status,
    deliveryReason: row.delivery_reason,
    railwayTriggerId: row.railway_trigger_id,
    nextDelivery: row.next_delivery,
  };
}

module.exports = {
  insertCronTriggerAudit,
  updateCronTriggerAuditResult,
  getCronTriggerAudit,
  insertNotificationSnapshot,
  getLatestSnapshot,
  getSnapshots,
};

