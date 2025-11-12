# Quickstart Guide: Notification Policy Refresh

## Objective
Verify that Railway cron triggers the notification workflow, suppresses redundant messages, and defers weekend deliveries.

## Prerequisites
- Node.js 18+ with project dependencies installed (`npm install`).
- Railway service with cron job capability and webhook secret configured.
- `.env` updated with `RAILWAY_CRON_SECRET` (or equivalent) and database credentials.
- Access to a Postgres instance populated with rotation data (`sprints`, `current_state`, `overrides`).

## Local Verification Steps
1. **Start the application locally**
   ```bash
   npm run dev
   ```
   Ensure the server exposes `/jobs/railway/notify-rotation`.

2. **Simulate Railway cron POST**
   ```bash
   curl -X POST http://localhost:3000/jobs/railway/notify-rotation \
     -H "Content-Type: application/json" \
     -H "X-Railway-Cron-Signature: $RAILWAY_CRON_SECRET" \
     -d '{"trigger_id":"11111111-2222-3333-4444-555555555555","scheduled_at":"2025-11-10T16:00:00Z","environment":"staging"}'
   ```
   - Expect HTTP `202` with `result` reflecting current data (`delivered`, `skipped`, or `deferred`).

3. **Confirm snapshot persistence**
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, delivery_status, delivery_reason FROM notification_snapshots ORDER BY captured_at DESC LIMIT 5;"
   ```
   - Verify a new row is inserted for each trigger.

4. **Test no-change suppression**
   - Run the curl command twice without altering rotation data.
   - Second call should return `result: "skipped"` and no Slack notifications should be emitted.
   - Inspect application logs to confirm snapshot hash reuse and `cron_trigger_audits.result = 'skipped'`.

5. **Test weekend deferral**
   - Temporarily mock `scheduled_at` to Saturday (e.g., `"2025-11-08T16:00:00Z"`).
   - Expect `result: "deferred"` and no Slack messages.

## Railway Configuration Checklist
- Create cron job in Railway dashboard with desired schedule (e.g., `0 16 * * *` for 8 AM PT).
- Set webhook URL to `/jobs/railway/notify-rotation`.
- Store signature secret in project variables.
- Verify logs include cron trigger audit entries matching Railway invocations.

## Rollback Steps
1. Disable Railway cron job to halt executions.
2. Re-enable legacy in-app scheduler if necessary (documented toggle).
3. Clear or archive `notification_snapshots` if schema reverted to previous state.
4. Communicate to on-call teams that notifications revert to prior behavior until fix reapplied.

