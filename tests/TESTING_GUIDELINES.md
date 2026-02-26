# Testing Guidelines (Mission-Critical)

Use this checklist when adding or modifying tests.

## 1) Prefer behavior-first assertions

- Assert externally visible behavior first (HTTP status/body, persisted state transitions, Slack intent calls).
- Treat implementation details as secondary assertions.
- For critical flows, include at least one negative-path test.

## 2) Keep mocks at system boundaries

- Prefer mocking low-level adapters (`db/connection`, cache client, Slack API wrappers).
- Avoid mocking the domain module under test.
- Use realistic failure cases in mocks (timeouts, rejects, malformed payloads).

## 3) Prevent cross-suite contamination

- Use helpers from `tests/helpers/mockIsolation.js`:
  - `resetModuleCache(...)` for explicit module reload boundaries.
  - `snapshotEnv(...)` + `restoreEnv(...)` for environment hygiene.
  - `restoreAllMocks()` in setup/teardown.
- Place mock-sensitive suites in isolated execution list (`scripts/test-stabilized.js`).

## 4) Time and timezone safety

- For cron/date logic, include PT boundary cases (weekend defer and day-boundary transitions).
- Freeze or control time source via mocks where practical.

## 5) Determinism checks before merge

- Baseline suite: `bun run test`
- Risk coverage gate: `bun run test:coverage`
- Determinism checks: `bun run test:determinism`

If a suite is flaky or order-dependent, it is not merge-ready.
