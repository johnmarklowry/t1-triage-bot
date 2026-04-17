/**
 * Railway Cron: rotation notification trigger.
 *
 * Contract (see specs/004-notification-updates/contracts/railway-cron.md):
 * - Mounted at /jobs → full path POST /jobs/railway/notify-rotation (must match RAILWAY_CRON_TARGET in railway.json).
 * - Auth: X-Railway-Cron-Signature header must equal RAILWAY_CRON_SECRET (required in production).
 * - Request body: optional { trigger_id?, scheduled_at?, environment? }.
 * - Success: 202 with { status: 'accepted', result, notifications_sent?, snapshot_id?, nextDelivery? }.
 * - Errors: 401 invalid/missing signature, 500 handler throw.
 */
const express = require('express');
const router = express.Router();
const { handleRailwayNotification } = require('../jobs/railwayNotifyRotation');
const { handleRailwayReleaseTeamUpdate } = require('../jobs/railwayUpdateReleaseTeam');
const { railwayCronSecret } = require('../config');

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
    service: 'railway-cron-route',
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

// Ensure JSON bodies are parsed for Railway webhook requests.
router.use(express.json());

router.post('/railway/notify-rotation', async (req, res) => {
  const startedAtMs = Date.now();
  const triggerId = req.body?.trigger_id || `route-${startedAtMs}`;
  logRailway('info', 'railway cron request received', {
    trigger_id: triggerId,
    path: req.path,
    method: req.method,
  });
  try {
    if (railwayCronSecret) {
      const signature = req.get('X-Railway-Cron-Signature');
      if (!signature || signature !== railwayCronSecret) {
        logRailway('warn', 'railway cron unauthorized', {
          trigger_id: triggerId,
          elapsed_ms: Date.now() - startedAtMs,
        });
        return res.status(401).json({
          status: 'unauthorized',
          message: 'Invalid Railway cron signature',
        });
      }
    }

    logRailway('info', 'railway cron executing notification job', {
      trigger_id: triggerId,
    });
    const result = await handleRailwayNotification(req.body || {});
    logRailway('info', 'railway cron job completed', {
      trigger_id: triggerId,
      elapsed_ms: Date.now() - startedAtMs,
      result: safeJson(result),
    });
    res.status(202).json({
      status: 'accepted',
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logRailway('error', 'railway cron handler failed', {
      trigger_id: triggerId,
      elapsed_ms: Date.now() - startedAtMs,
      error: errorMessage,
    });
    res.status(500).json({
      status: 'error',
      message: errorMessage,
    });
  }
});

router.post('/railway/update-release-team', async (req, res) => {
  const startedAtMs = Date.now();
  const triggerId = req.body?.trigger_id || `route-release-${startedAtMs}`;
  logRailway('info', 'railway release-team request received', {
    trigger_id: triggerId,
    path: req.path,
    method: req.method,
  });
  try {
    if (railwayCronSecret) {
      const signature = req.get('X-Railway-Cron-Signature');
      if (!signature || signature !== railwayCronSecret) {
        logRailway('warn', 'railway release-team unauthorized', {
          trigger_id: triggerId,
          elapsed_ms: Date.now() - startedAtMs,
        });
        return res.status(401).json({
          status: 'unauthorized',
          message: 'Invalid Railway cron signature',
        });
      }
    }

    const result = await handleRailwayReleaseTeamUpdate(req.body || {});
    logRailway('info', 'railway release-team job completed', {
      trigger_id: triggerId,
      elapsed_ms: Date.now() - startedAtMs,
      result: safeJson(result),
    });
    res.status(202).json({
      status: 'accepted',
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logRailway('error', 'railway release-team handler failed', {
      trigger_id: triggerId,
      elapsed_ms: Date.now() - startedAtMs,
      error: errorMessage,
    });
    res.status(500).json({
      status: 'error',
      message: errorMessage,
    });
  }
});

module.exports = router;

