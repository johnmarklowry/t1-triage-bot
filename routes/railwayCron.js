const express = require('express');
const router = express.Router();
const { handleRailwayNotification } = require('../jobs/railwayNotifyRotation');
const { railwayCronSecret } = require('../config');

// Ensure JSON bodies are parsed for Railway webhook requests.
router.use(express.json());

router.post('/railway/notify-rotation', async (req, res) => {
  try {
    if (railwayCronSecret) {
      const signature = req.get('X-Railway-Cron-Signature');
      if (!signature || signature !== railwayCronSecret) {
        return res.status(401).json({
          status: 'unauthorized',
          message: 'Invalid Railway cron signature',
        });
      }
    }

    const result = await handleRailwayNotification(req.body || {});
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

