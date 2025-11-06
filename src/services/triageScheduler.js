/********************************
 * triageScheduler.js
 ********************************/
const cron = require('node-cron');
const { run5pmCheck, run8amCheck } = require('./triageLogic');

function scheduleDailyJobs() {
  // 5PM PT daily
  cron.schedule('0 17 * * *', async () => {
    console.log('[CRON] 5PM job fired.');
    await run5pmCheck();
  }, {
    timezone: 'America/Los_Angeles'
  });

  // 8AM PT daily
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] 8AM job fired.');
    await run8amCheck();
  }, {
    timezone: 'America/Los_Angeles'
  });

  console.log('Scheduled daily cron jobs at 5PM & 8AM PT.');
}

module.exports = { scheduleDailyJobs };
