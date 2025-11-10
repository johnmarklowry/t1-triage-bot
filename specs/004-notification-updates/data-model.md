# Data Model: Notification Policy Refresh

## Overview
The feature introduces persistence for notification state and scheduling audits so the triage bot can suppress redundant alerts, rely on Railway cron triggers, and respect weekday delivery policies.

## Entities

### notification_snapshots
| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL | Primary key |
| `captured_at` | TIMESTAMP WITH TIME ZONE | When the snapshot was generated |
| `discipline_assignments` | JSONB | Map of discipline -> Slack user ID for last delivered notification |
| `hash` | TEXT | Digest representing the notification payload for quick comparisons |
| `delivery_status` | TEXT | Enum: `delivered`, `skipped`, `deferred` |
| `delivery_reason` | TEXT | Optional narrative (e.g., "no changes", "weekend defer") |
| `railway_trigger_id` | UUID | Reference to cron trigger audit (nullable) |

### cron_trigger_audits
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key (Railway webhook request ID or generated UUID) |
| `triggered_at` | TIMESTAMP WITH TIME ZONE | Time Railway cron invoked the system |
| `result` | TEXT | Enum: `delivered`, `skipped`, `deferred`, `error` |
| `details` | JSONB | Metadata such as error messages, notification count |

### delivery_window_policy (logical configuration)
- `timezone`: Fixed to `America/Los_Angeles`
- `business_days`: `[Monday, Tuesday, Wednesday, Thursday, Friday]`
- `holiday_calendar`: Optional hook for future enhancements
- `defer_strategy`: `next_business_day`

## Relationships
- `notification_snapshots.railway_trigger_id` → `cron_trigger_audits.id` (nullable) to trace which trigger produced a snapshot.
- Notification workflow reads rotation data from existing tables (`current_state`, `sprints`, `overrides`) but does not modify their schema.

## State Transitions
1. Railway cron invokes the workflow → record entry in `cron_trigger_audits`.
2. Workflow loads latest rotation assignments and compares hash with most recent `notification_snapshots` row.
3. - If unchanged or weekend: record new snapshot marked `skipped` or `deferred`.
   - If changed and weekday: deliver notifications and persist snapshot with `delivered`.

## Validation & Error Handling
- Hash comparison uses deterministic ordering of disciplines to avoid false positives.
- Deferred snapshots include `delivery_reason` so Monday runs can collate weekend changes.
- On errors, workflow logs context and sets `cron_trigger_audits.result = 'error'`; retry strategy decided in implementation.

