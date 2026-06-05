/**
 * Monorail CronJob entrypoint for daily rotation notifications.
 * Runs the same handler as POST /jobs/railway/notify-rotation without HTTP.
 */
require('../loadEnv').loadEnv();
require('../lib/databaseUrl').ensureDatabaseUrl();

async function main() {
  const { handleRailwayNotification } = require('./railwayNotifyRotation');
  const triggerId = process.env.MONORAIL_JOB_RUN_ID
    || process.env.CRON_TRIGGER_ID
    || `monorail-${Date.now()}`;

  const result = await handleRailwayNotification({
    trigger_id: triggerId,
    scheduled_at: new Date().toISOString(),
    environment: process.env.APP_ENV || 'production',
  });

  console.log(JSON.stringify({ status: 'ok', trigger_id: triggerId, result }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[runNotifyRotationCli] failed:', error);
    process.exit(1);
  });
