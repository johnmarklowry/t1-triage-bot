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
const { railwayCronSecret } = require('../config');

// Ensure JSON bodies are parsed for Railway webhook requests.
router.use(express.json());

router.post('/railway/notify-rotation', async (req, res) => {
  console.log('[RAILWAY] Cron job received: POST /jobs/railway/notify-rotation');
  try {
    if (railwayCronSecret) {
      const signature = req.get('X-Railway-Cron-Signature');
      if (!signature || signature !== railwayCronSecret) {
        console.warn('[RAILWAY] Unauthorized: invalid or missing X-Railway-Cron-Signature');
        return res.status(401).json({
          status: 'unauthorized',
          message: 'Invalid Railway cron signature',
        });
      }
    }

    console.log('[RAILWAY] Executing rotation notification job');
    const result = await handleRailwayNotification(req.body || {});
    console.log('[RAILWAY] Rotation job completed', result);
    res.status(202).json({
      status: 'accepted',
      ...result,
    });
  } catch (error) {
    console.error('[RAILWAY] Notification handler failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

module.exports = router;

