# Contract: Railway Cron Notification Trigger

## Endpoint
- **Method**: `POST`
- **Path**: `/jobs/railway/notify-rotation`
- **Authentication**: Railway cron secret header `X-Railway-Cron-Signature` (HMAC or shared token)

## Request
```json
{
  "trigger_id": "1c3f26b0-3c7d-4e6f-9d3a-5a0217f3f942",
  "scheduled_at": "2025-11-10T15:00:00Z",
  "environment": "production"
}
```

### Request Rules
- `trigger_id` MUST be unique per Railway invocation (UUID).
- `scheduled_at` MUST be in ISO 8601 UTC.
- `environment` identifies the Railway service workspace; defaults to `"production"` when omitted.

## Response
### Success
```json
{
  "status": "accepted",
  "result": "delivered",
  "notifications_sent": 5,
  "snapshot_id": 42
}
```

### Deferred (weekend)
```json
{
  "status": "accepted",
  "result": "deferred",
  "next_delivery": "2025-11-10T16:00:00Z",
  "snapshot_id": 43
}
```

### Skipped (no changes)
```json
{
  "status": "accepted",
  "result": "skipped",
  "reason": "rotation unchanged",
  "snapshot_id": 44
}
```

### Error
```json
{
  "status": "error",
  "message": "Failed to load rotation data"
}
```

## Error Codes
| HTTP Code | Condition | Notes |
|-----------|-----------|-------|
| 202 | Accepted | Workflow queued/executed successfully |
| 401 | Unauthorized | Missing/invalid Railway signature |
| 422 | Unprocessable Entity | Invalid payload schema |
| 500 | Internal Server Error | Unexpected failure; logged for follow-up |

## Postconditions
- Every request creates a `cron_trigger_audits` row.
- Successful deliveries create a `notification_snapshots` row linked via `railway_trigger_id`.
- Deferred runs store `next_delivery` suggestion for operations monitoring.

## Admin pre-alignment (in-app)
When an admin applies rotation changes for the current sprint (`applyCurrentSprintRotation` or `setCurrentSprintRolesFromAdmin`), the server inserts a `notification_snapshots` row with `delivery_status: skipped` and `delivery_reason: admin pre-aligned`, using the same assignment hash as the Railway job. The next Railway cron invocation then typically hits the **skipped** branch (rotation unchanged relative to the latest snapshot), avoiding redundant Slack user-group/topic updates for a roster the admin already synchronized.

Do not run the in-app 8AM/5PM scheduler (`ENABLE_IN_APP_CRON=true`) alongside Railway cron in production unless you understand duplicate side effects; see `ENVIRONMENT_COMMANDS.md`.

