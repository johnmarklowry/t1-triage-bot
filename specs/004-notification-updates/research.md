# Research Findings

## Snapshot Comparison & Change Detection
- **Decision**: Reuse the existing `currentState` persistence and compute a hashed representation of the last delivered notification payload stored in a new `NotificationSnapshot` record (Postgres table or JSON blob) to determine whether assignments changed.
- **Rationale**: Persisting the last-sent snapshot enables deterministic diffing between scheduled runs, ensuring notifications are only emitted when data changes and supporting audit trails.
- **Alternatives Considered**:
  - In-memory cache: Fails across restarts and Railway cron executions.
  - Comparing against sprint schedule only: Misses override-driven changes applied outside initial schedule generation.

## Railway Cron Integration
- **Decision**: Configure a Railway cron job to invoke an HTTP endpoint or serverless function that triggers the notification workflow, keeping application servers free of long-lived schedulers.
- **Rationale**: Railway cron guarantees execution even when Node processes restart, aligning with requirement for infrastructure-managed scheduling.
- **Alternatives Considered**:
  - Retaining `node-cron` within the app: Susceptible to missed runs during deploys or crashes.
  - External third-party scheduler: Adds unnecessary dependencies beyond existing Railway capabilities.

## Weekday Delivery Rules
- **Decision**: Implement a utility that evaluates Pacific Time weekdays using `dayjs` with timezone plugin, deferring notifications triggered on Saturday/Sunday to the next Monday at the configured time.
- **Rationale**: Keeps logic localized, leverages existing date library usage, and ensures weekend triggers are accounted for when Railway cron executes daily.
- **Alternatives Considered**:
  - Adjusting cron schedule to weekdays only: Would skip weekend-triggered state changes entirely and miss Monday catch-up.
  - Using system locale checks: Less explicit and risks timezone drift compared to `dayjs.tz`.

## In-App Scheduler Sunset Plan
- **Decision**: Decommission the `triageScheduler.js` `node-cron` job after the Railway webhook is live, leaving the module only to host transitional helpers until US2 removes the legacy registration.
- **Rationale**: Documenting the removal order ensures we disable the legacy scheduler immediately after the Railway workflow is validated, preventing duplicate notifications during rollout.
- **Removal Steps**:
  1. Guard the existing scheduler behind a feature flag so it can be turned off once Railway cron is verified in staging.
  2. Delete the `node-cron` dependency and scheduler registration when US2 lands, ensuring all scheduling is driven by Railway.
  3. Update operational runbooks to reference Railway cron exclusively and note the deprecation date of the in-app scheduler.

