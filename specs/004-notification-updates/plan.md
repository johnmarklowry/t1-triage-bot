# Implementation Plan: Notification Policy Refresh

**Branch**: `004-notification-updates` | **Date**: 2025-11-10 | **Spec**: `/specs/004-notification-updates/spec.md`
**Input**: Feature specification from `/specs/004-notification-updates/spec.md`

## Summary

Update the triage bot’s notification workflow to suppress redundant Slack alerts, execute on an infrastructure-managed Railway cron schedule, and defer routine messages to weekdays while persisting snapshot and audit data for traceability.

## Technical Context

**Language/Version**: Node.js 18  
**Primary Dependencies**: `@slack/web-api`, `dayjs` with timezone plugin, custom repository layer  
**Storage**: PostgreSQL (`notification_snapshots`, `cron_trigger_audits` tables)  
**Testing**: Manual verification via quickstart steps, targeted integration harness for cron endpoint  
**Target Platform**: Railway-hosted Node.js service with Slack integration  
**Project Type**: Backend service with scheduled jobs  
**Performance Goals**: Single cron execution per day; notification diffing completes within 2 seconds; zero redundant Slack messages  
**Constraints**: Maintain Slack rate limits, ensure idempotent cron handling, guard against duplicate executions  
**Scale/Scope**: Supports ~50 team members across disciplines; one daily cron run plus manual replays

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with Triage Rotation Bot Constitution principles:

- **I. Slack API Compliance**: Does this feature interact with Slack APIs? If yes, verify rate limit handling, event response times (<3s), token management, and message clarity.
- **II. Code Maintainability**: Is the proposed code structure clear and well-documented? Are modules organized consistently? Is complexity justified and documented?
- **III. Error Handling & Resilience**: Are all error paths handled? Is graceful degradation implemented for dependencies? Are errors logged with context?
- **IV. Security & Configuration**: New Railway cron secret documented in `.env.example`; cron payload validated.
- **V. Documentation & Testing**: Quickstart provides manual validation, research defines migrations; spec outlines auditing.

**Compliance Status**: ✅ Compliant

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```
specs/004-notification-updates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── railway-cron.md
```

### Source Code (repository root)

```text
db/
└── migrations/
    ├── 003_allow_audit_upsert.sql
    └── 004_create_notification_snapshots.sql  # new migration for this feature

jobs/
└── railwayNotifyRotation.js                    # new job handler invoked by Railway cron

repositories/
└── notificationSnapshots.js                    # data access for notification snapshot persistence

services/
└── notifications/
    ├── snapshotService.js                      # diffing + persistence orchestration
    └── weekdayPolicy.js                        # weekday evaluation utilities

routes/
└── railwayCron.js                              # express route for Railway cron webhook

slackNotifier.js                                # updated to support selective user notifications
triageScheduler.js                              # remove in-app cron scheduling logic

tests/
└── integration/
    └── railwayCron.test.js                     # covers webhook outcomes
```

**Structure Decision**: Extend the existing backend by adding dedicated directories (`jobs/`, `repositories/`, `services/notifications/`, `routes/`) to keep cron, persistence, and policy logic modular. Update existing helpers (`slackNotifier.js`, `triageScheduler.js`) so the new Railway-driven workflow replaces the in-app scheduler and targets only changed assignments.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
