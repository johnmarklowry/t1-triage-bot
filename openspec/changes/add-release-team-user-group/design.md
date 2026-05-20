## Context

This change introduces release-team visibility in Slack through a managed user group that tracks who owns the upcoming release. The current code already computes triage assignees by sprint index with override support and updates an on-call user group via full membership replace.

The release-team workflow reuses existing sprint and assignee computation but adds a distinct membership filter (`on_release_team`) and a date-relative trigger condition:
- Run daily at a fixed PT time.
- Only execute update when `tomorrow PT` equals a sprint `startDate`.

## Goals

- Keep `@release_team` aligned to the sprint that starts tomorrow in PT.
- Use DB-backed per-user/per-discipline release-team signifier.
- Mirror triage staging-safety and Slack user-group update semantics.
- Avoid accidental empty-group clears.

## Non-Goals

- Vacation/cover override UX specific to release duty.
- Complex transactional coupling between group update and channel topic update.
- Automatic clearing when the schedule has no future sprint.

## Decisions

### 1) Data model

- Add `on_release_team BOOLEAN NOT NULL DEFAULT FALSE` to `users`.
- In JS objects, expose this as `onReleaseTeam` for consistency.
- Flag is per `(slackId, discipline)` row; release eligibility must check the role discipline row, not arbitrary matching row for the same `slackId`.

### 2) Repository and read paths

- `UsersRepository.getDisciplines*` returns `onReleaseTeam`.
- `UsersRepository.addUser` accepts optional `onReleaseTeam` and upserts it.
- Add repository method to update release-team flag for a specific `(slackId, discipline)`.
- `readDisciplines()` preserves `onReleaseTeam` in both DB and JSON modes.

### 3) JSON fallback policy

- JSON mode remains supported.
- `disciplines*.json` member objects may include `onReleaseTeam` (default `false` when absent).
- Release automation in JSON mode is allowed if the field is present; absent field is treated as false.

### 4) Schedule predicate and sprint selection

- Compute `tomorrowPT = getTodayPT().add(1, 'day')`.
- Find sprint `S` where `parsePTDate(startDate).isSame(tomorrowPT, 'day')`.
- If none found: no-op.
- If multiple found: log error and no-op (data integrity issue).
- When `S` is found, compute assignees via `getSprintUsers(S.index, { usePersistedForCurrentSprint: false })`.

### 5) Membership computation

- For each role from `getSprintUsers`, map role -> discipline key and read the corresponding discipline list from `readDisciplines()`.
- Include assignee only if matching discipline row has `onReleaseTeam === true`.
- Dedupe user IDs.
- If resulting set is empty: warn and skip `usergroups.users.update` (preserve current Slack membership).

### 6) Slack updates and staging behavior

- New updater uses:
  - production: `SLACK_RELEASE_TEAM_USERGROUP_ID`
  - staging: `SLACK_RELEASE_TEAM_USERGROUP_ID_STAGING`
- Staging never falls back to production release-group ID.
- Optional topic update to `RELEASES_CHANNEL_ID` is best-effort and non-blocking for membership success.

## Risks / Trade-offs

- **No matching upcoming sprint:** group may become stale; accepted for MVP.
- **Role-to-discipline mapping drift:** handled with explicit mapping and tests.
- **Slack partial failure (topic):** membership update remains source of truth; log warning.
- **Admin/cron race:** eventual consistency accepted.

## Migration Plan

1. Add schema field and SQL migration.
2. Update repository + data loaders.
3. Add admin controls for setting flag.
4. Add release computation + Slack updater + cron route.
5. Add tests and env/documentation updates.

## Observability

- Structured logs in cron route include:
  - trigger metadata
  - matched sprint index/name
  - computed release IDs
  - empty-set skip reason
  - Slack API failures
