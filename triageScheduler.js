/********************************
 * triageScheduler.js
 ********************************/
const cron = require('node-cron');
const { run5pmCheck, run8amCheck } = require('./triageLogic');

const ENABLE_IN_APP_CRON = process.env.ENABLE_IN_APP_CRON === 'true';

function scheduleDailyJobs() {
  if (!ENABLE_IN_APP_CRON) {
    console.log('[CRON] In-app cron scheduler disabled (ENABLE_IN_APP_CRON !== "true").');
    return;
  }

  cron.schedule('0 17 * * *', async () => {
    console.log('[CRON] 5PM job fired.');
    await run5pmCheck();
  }, {
    timezone: 'America/Los_Angeles'
  });

  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] 8AM job fired.');
    await run8amCheck();
  }, {
    timezone: 'America/Los_Angeles'
  });

  console.log('[CRON] Scheduled daily cron jobs at 5PM & 8AM PT.');
  console.warn(
    '[CRON] ENABLE_IN_APP_CRON=true runs 5PM/8AM jobs in this process. If Railway cron also calls rotation/notification endpoints, you may get duplicate side effects—prefer one scheduler in production. See ENVIRONMENT_COMMANDS.md.'
  );
}

module.exports = { scheduleDailyJobs };
