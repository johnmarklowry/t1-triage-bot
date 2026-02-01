# Changelog — T1 Triage Bot

Recent changes and the outcomes they support.

---

## 0. Playwright e2e (Slack staging, pre-production gate)

**What changed**

- Added Playwright e2e tests that drive the Slack web client (app.slack.com) against the staging workspace and bot.
- One-time auth setup (`npm run test:e2e:auth`) saves session to `tests/e2e/.auth/storageState.json`; e2e runs reuse it (`npm run test:e2e`).
- Smoke suite: App Home loads (UAT-022), slash command opens modal (UAT-003), admin override list (UAT-011).
- Config: `playwright.config.js`, projects `setup` and `slack-e2e`, storageState, timeouts; docs in `tests/e2e/README.md` and `.env.e2e.example`.

**Outcomes it supports**

- **Pre-production confidence** — Run e2e against Slack (staging) before promoting to production; gate promote on e2e success in CI if desired.
- **Smoke and regression** — Repeatable “does the app work in Slack?” check; expand with more UAT scenarios under `tests/e2e/slack/`.

---

## 1. Automated test suite (unit + integration)

**What changed**

- Added unit tests for override flow (approve, decline, list, modal), schedule command handler, data/utilities (overrides, dates, repository), and supporting modules (`commandUtils`, `slackMrkdwn`, `weekdayPolicy`).
- Added integration tests for health endpoint, override approve/decline flows, and Railway cron job.
- Standardized on Bun for test runs (`bun test --serial`); added Supertest for HTTP tests.
- Refactored repository overrides test into `aaa-repository.overrides.test.js`; updated `overrideHandler.js` and `scheduleCommandHandler.js` to support testability.

**Outcomes it supports**

- **Safer changes** — Critical paths (overrides, schedule, cron, health) are covered; regressions are caught before release.
- **Faster review** — Reviewers can rely on tests instead of manual checks for covered behavior.
- **Easier onboarding** — New contributors can run tests to validate behavior and understand intended outcomes.
- **Confidence in refactors** — Tests document expected behavior and protect it during future changes.

---

## 2. Environment-specific slash commands (staging)

**What changed**

- When `ENVIRONMENT=staging` or `APP_ENV=staging`, all slash commands use a `-staging` suffix (e.g. `/triage-schedule-staging`, `/override-list-staging`, `/admin-sprints-staging`).
- Introduced `commandUtils.js` (`getEnvironmentCommand` / `getEnvironmentCommands`) and wired it into `scheduleCommandHandler.js`, `overrideHandler.js`, and `adminCommands.js`.
- Added unit tests in `commandUtils.test.js` for staging vs production command names.

**Outcomes it supports**

- **Staging and production side-by-side** — No command clashes when both environments run in the same Slack workspace.
- **UAT without affecting production** — Staging users use `-staging` commands; production keeps base names.
- **Regression coverage** — Command naming is tested so env behavior stays correct as code evolves.

---

## 3. Staging configuration (channels, on-call group, seeding, data)

**What changed**

- Staging uses dedicated channels (`lcom-triage-admin-staging`, `lcom-triage-staging`), separate workspace (Teamone), and separate bot (NATE Triage Team Bot).
- Staging uses a separate Slack on-call user group (`SLACK_USERGROUP_ID_STAGING` or auto `triage-oncall-staging`) so rotation updates never touch production.
- Staging seed scripts skip re-seeding when data exists; `FORCE_SEED=1` forces a full re-seed.
- Staging can use `disciplines.staging.json` when `TRIAGE_ENV=staging` or `NODE_ENV=staging`.

**Outcomes it supports**

- **Isolated UAT** — Staging tests do not modify production channels, on-call group, or production data.
- **Repeatable staging** — Controlled seeding and optional staging data files make staging behavior predictable for test runs.
- **Clear handoff** — Behavior and config are documented in `UAT_STAGING.md` and `ENVIRONMENT_COMMANDS.md` for regression and handoff.

---

## 4. UAT test matrix and scope

**What changed**

- Defined UAT scope in `UAT_STAGING.md`: Home tab, modals/CTAs, env commands, triage schedule, overrides, admin commands/views, user management, and safe handling of Slack payload variants.
- Added a test matrix (UAT-001–027) covering env commands, triage schedule, overrides, override management, admin, Home tab, modals, and triage channel mentions.
- Out-of-scope for this UAT: DB connectivity and data correctness (focus is behavior and messaging).

**Outcomes it supports**

- **Structured UAT** — Testers and stakeholders have a clear checklist and pass/fail criteria.
- **Traceability** — Each scenario has an ID for logging issues and follow-up.
- **Focused validation** — Scope is explicit so UAT stays aligned with behavior/messaging goals.

---

## 5. PostgreSQL migration and data access

**What changed** (from project specs)

- Migration from JSON files to PostgreSQL for users, sprints, assignments, overrides, and audit logs; added migration path and data access layer.

**Outcomes it supports**

- **ACID and consistency** — Transactions and relational model reduce risk of data corruption and inconsistent state.
- **Audit trail** — Historical data and audit logs support compliance and debugging.
- **Scalability** — Database-backed storage supports future reporting and growth.

---

## 6. Database reliability (constraint and duplicate-key handling)

**What changed** (from project specs)

- Addressed duplicate-key and constraint issues (users, sprints, current state, overrides) with improved error handling, upserts where appropriate, and validation before writes.

**Outcomes it supports**

- **Fewer runtime failures** — Constraint violations are handled gracefully instead of crashing or failing silently.
- **Better user feedback** — Users see clear messages when operations cannot be completed.
- **Stable behavior under load** — Concurrent operations and race conditions are handled in a predictable way.

---

## 7. Triage schedule command (`/triage-schedule`)

**What changed** (from project specs)

- Added `/triage-schedule` (or env-specific `/triage-schedule-staging`) so users can query who is on call on a specific future date; date validation and modal for date selection.

**Outcomes it supports**

- **Planning and coordination** — Users can see who is on call on a given date without manual calculation.
- **Consistent UX** — Same pattern as other slash commands, with staging/production naming where applicable.
- **Completion of core triage flows** — Aligns with the planned “who’s on call on a certain date” capability.

---

## Summary

| Change | Primary outcomes |
|--------|------------------|
| Automated tests | Safer releases, faster review, easier onboarding, refactor confidence |
| Env-specific commands | Staging/production coexistence, UAT isolation, regression coverage |
| Staging config | Isolated UAT, repeatable staging, clear documentation |
| UAT matrix | Structured UAT, traceability, focused validation |
| PostgreSQL migration | Consistency, audit trail, scalability |
| DB reliability fixes | Fewer failures, better feedback, stable behavior under load |
| Triage schedule command | Planning/coordination, consistent UX, core flow completion |
