# Tasks: Notification Policy Refresh

**Input**: Design documents from `/specs/004-notification-updates/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md  
**Tests**: Manual verification per quickstart; targeted integration tests for Railway cron webhook.

## Format: `[ID] [P?] [Story] Description`

- **[P]** denotes tasks that can run in parallel (no shared dependencies, distinct files).
- **[US#]** labels work for a specific user story (e.g., US1, US2, US3).
- Every task includes an explicit file path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Document prerequisites and align environment configuration before code changes.

- [X] T001 Update Railway cron secret documentation in `env.example` and load it in `config.js` (or create if absent) to expose `RAILWAY_CRON_SECRET`.
- [X] T002 Review current in-app scheduler implementation in `triageScheduler.js` and capture removal plan notes in `specs/004-notification-updates/research.md`.
- [X] T003 Add Railway cron deployment notes to `ENVIRONMENT_COMMANDS.md` and `railway.json` so operations understands the new schedule.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish persistence, routing, and service scaffolding required by all user stories. No user story work can begin until this phase is complete.

- [X] T004 Create migration `db/migrations/004_create_notification_snapshots.sql` implementing `notification_snapshots` and `cron_trigger_audits` tables per data-model.md.
- [X] T005 Register the new migration in `db/migrate.js` and update verification instructions in `DATABASE_SETUP.md`.
- [X] T006 Create repository module `repositories/notificationSnapshots.js` with CRUD helpers for snapshots and trigger audits.
- [X] T007 Scaffold notification services directory `services/notifications/` with placeholder `snapshotService.js` and `weekdayPolicy.js` exports.
- [X] T008 Scaffold Railway cron job handler `jobs/railwayNotifyRotation.js` that will coordinate snapshot diffing and Slack delivery.
- [X] T009 Add Express route `routes/railwayCron.js` that validates Railway signatures and invokes the job handler.
- [X] T010 Wire the new route into `server.js` (or `app.js` if present) under `/jobs/railway/notify-rotation`.

---

## Phase 3: User Story 1 – Quiet On-Call Notifications (Priority: P1) 🎯 MVP

**Goal**: Suppress redundant Slack notifications by diffing notification snapshots and only messaging changed assignments.

**Independent Test**: Trigger the Railway cron endpoint twice without changing rotation data; the second invocation MUST skip Slack delivery and persist a `skipped` snapshot.

- [X] T011 [US1] Implement deterministic snapshot hashing in `services/notifications/snapshotService.js` using ordered discipline assignments.
- [X] T012 [US1] Persist and retrieve snapshots via `repositories/notificationSnapshots.js`, ensuring latest snapshot lookup works.
- [X] T013 [US1] Update `jobs/railwayNotifyRotation.js` to load current rotation data, compare against the last snapshot, and branch on `delivered` vs `skipped`.
- [X] T014 [US1] Update `slackNotifier.js` to accept a list of changed disciplines and send DMs only to affected users.
- [X] T015 [US1] Record snapshot outcomes (`delivered`, `skipped`) with reasons in `notification_snapshots` after each job run.
- [X] T016 [US1] Write integration test `tests/integration/railwayCron.test.js` covering unchanged data scenario (expects HTTP 202 with `result: "skipped"`).
- [ ] T017 [US1] Follow quickstart step 4 to manually verify duplicate suppression and record observations in `specs/004-notification-updates/quickstart.md`.

---

## Phase 4: User Story 2 – Railway-Orchestrated Scheduling (Priority: P2)

**Goal**: Replace in-process schedulers with Railway cron while ensuring idempotent execution.

**Independent Test**: Manually invoke the Railway webhook (curl) and observe a single job execution with matching audit row regardless of application restarts.

- [X] T018 [US2] Implement Railway signature validation middleware in `routes/railwayCron.js` using `RAILWAY_CRON_SECRET`.
- [X] T019 [US2] Record cron trigger audits in `repositories/notificationSnapshots.js` for every webhook invocation, storing `trigger_id`, `scheduled_at`, and result.
- [X] T020 [US2] Remove or disable `node-cron` scheduling from `triageScheduler.js`, delegating scheduling to Railway configuration docs.
- [X] T021 [US2] Ensure `jobs/railwayNotifyRotation.js` is idempotent by guarding against concurrent executions (e.g., lock via trigger ID) within the job module.
- [X] T022 [US2] Add integration test `tests/integration/railwayCron.test.js` case verifying a valid signature enqueues exactly one job execution and logs audit row.
- [X] T023 [US2] Update `specs/004-notification-updates/quickstart.md` Railway configuration checklist with signature validation steps.

---

## Phase 5: User Story 3 – Weekday Delivery Guardrails (Priority: P3)

**Goal**: Defer routine duty notifications to weekdays while consolidating weekend changes into Monday summaries.

**Independent Test**: Trigger the webhook with `scheduled_at` on Saturday; the job must persist a `deferred` snapshot and skip Slack delivery. Next Monday run must deliver consolidated updates.

- [X] T024 [US3] Implement weekday evaluation utility in `services/notifications/weekdayPolicy.js` using `dayjs.tz` for `America/Los_Angeles`.
- [X] T025 [US3] Extend `jobs/railwayNotifyRotation.js` to call the weekday policy and branch into `deferred` outcomes when weekend triggers occur.
- [X] T026 [US3] Ensure deferred snapshots store `next_delivery` metadata in `notification_snapshots.delivery_reason` or dedicated column per data-model guidance.
- [X] T027 [US3] Update `jobs/railwayNotifyRotation.js` to include weekend changes in the next weekday delivery by reading deferred snapshots.
- [X] T028 [US3] Add integration test `tests/integration/railwayCron.test.js` weekend scenario verifying `result: "deferred"` and zero Slack calls.
- [X] T029 [US3] Update `quickstart.md` weekend test instructions (step 5) with expected `deferred` response payload and Monday follow-up verification.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, observability, and regression safeguards after core stories ship.

- [ ] T030 [P] Add structured logging in `jobs/railwayNotifyRotation.js` for snapshot hashes, outcomes, and affected users.
- [ ] T031 [P] Update `DATABASE_SETUP.md` and `ENVIRONMENT_COMMANDS.md` with rollback guidance for disabling Railway cron.
- [ ] T032 [P] Document snapshot/audit schema in `DATABASE_SETUP.md` and add ERD notes to `specs/004-notification-updates/data-model.md`.
- [ ] T033 [P] Run `node setup-database.js` to ensure migrations succeed, capturing results in `specs/004-notification-updates/quickstart.md`.
- [ ] T034 [P] Conduct manual end-to-end test using quickstart steps and sign off in `specs/004-notification-updates/tasks.md` (append summary).

---

## Dependencies & Execution Order

1. **Setup → Foundational → User Stories → Polish** (strict order).
2. Within user stories, follow task order unless marked `[P]`.
3. User story dependencies:  
   - US1 is MVP prerequisite for US2 and US3.  
   - US2 depends on US1 (job must exist before wiring cron).  
   - US3 depends on US1 (diffing) and US2 (cron integration) to defer correctly.

---

## Parallel Execution Opportunities

- Setup tasks (T001–T003) can run concurrently.  
- Foundational tasks T006–T010 can proceed in parallel once migration scaffolding (T004–T005) completes.  
- User story tasks marked `[P]` (none in US phases currently) may run concurrently when noted.  
- Polish tasks T030–T034 are parallel-friendly after all stories are complete.

---

## Implementation Strategy

1. **MVP**: Complete Phase 1–3 (Setup, Foundational, User Story 1) delivering quiet notifications with snapshot persistence.  
2. **Extend**: Implement Phase 4 to switch scheduling to Railway while maintaining idempotency.  
3. **Enhance**: Apply weekday guardrails (Phase 5) and finish polish tasks for observability and documentation.  
4. **Validate**: Use quickstart manual tests and integration suite before enabling Railway cron in production.

