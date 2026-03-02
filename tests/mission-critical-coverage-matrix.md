# Mission-Critical Coverage Matrix

This matrix tracks behavior-level coverage for production-critical flows.
Status values:
- `covered`: scenario has at least one deterministic assertion.
- `partial`: scenario is tested, but an important branch or side effect is not pinned.
- `gap`: no direct test currently validates the scenario.

## Railway Cron + Notification Delivery

| Scenario | Expected behavior | Current coverage | Status | Notes |
| --- | --- | --- | --- | --- |
| Missing/invalid cron signature | 401 unauthorized with stable response shape | `tests/integration/railwayCron.test.js` (`rejects requests without a valid signature`) | covered | Auth contract is pinned. |
| Valid trigger, unchanged assignments | 202 accepted + `result=skipped`, no Slack update side effects | `tests/integration/railwayCron.test.js` (`skips notification when assignments hash matches latest snapshot`) | covered | Good side-effect assertions present. |
| Valid trigger, changed assignments (delivered) | 202 accepted + `result=delivered`, snapshot saved, Slack update called | `tests/integration/railwayCron.test.js` (`delivers notifications when assignments change`) | covered | Pins delivered branch. |
| Deferred delivery (weekend policy) with refreshed state | `result=deferred`, `nextDelivery` set, Slack group/topic updated when refreshed | `tests/integration/railwayCron.test.js` (`deferred: updates usergroup/topic when state was refreshed`) | covered | Weekend defer behavior pinned. |
| Deferred delivery without refreshed state | `result=deferred`, no Slack group/topic updates | `tests/integration/railwayCron.test.js` (`deferred: does not update usergroup/topic when state was not refreshed`) | covered | Good negative side-effect assertion. |
| Parser rejects malformed JSON | 400 response | `tests/integration/railwayCron.test.js` (`returns 400 ... malformed/primitive JSON`) | covered | Parser-level behavior pinned. |
| Notification handler throws | 500 error shape + message | `tests/integration/railwayCron.test.js` (`returns 500 and message when ... throws`) | covered | Failure path covered. |
| Idempotent replay by identical trigger ID | Does not re-run side effects, returns prior result deterministically | none | gap | High-impact production safety check. |
| Audit persistence payload integrity | Audit result records include expected metadata fields | none | gap | Needed for incident forensics. |

## In-App Scheduler + Rotation Transitions

| Scenario | Expected behavior | Current coverage | Status | Notes |
| --- | --- | --- | --- | --- |
| Cron disabled | No jobs registered | `tests/unit/triageScheduler.test.js` (`does not register cron jobs ...`) | covered | Config gate pinned. |
| Cron enabled | Registers `0 17 * * *` and `0 8 * * *` PT jobs | `tests/unit/triageScheduler.test.js` (`registers 5PM and 8AM ...`) | covered | Schedule contract pinned. |
| Scheduled callbacks execute right handlers | 5PM callback -> `run5pmCheck`, 8AM callback -> `run8amCheck` | `tests/unit/triageScheduler.test.js` (`executes scheduled callbacks`) | covered | Handler wiring pinned. |
| 8AM sprint transition updates state and Slack artifacts | Notify + group/topic + persisted state update | none (direct `run8amCheck` coverage missing) | gap | Core mission-critical behavior not directly tested. |
| 5PM handoff notification on sprint end day | Notifies old/new assignees on boundary day only | none (direct `run5pmCheck` coverage missing) | gap | Date-boundary logic risk remains. |

## Overrides + Current State Synchronization

| Scenario | Expected behavior | Current coverage | Status | Notes |
| --- | --- | --- | --- | --- |
| Apply current sprint rotation when overrides changed | `updated=true`, affected users returned, Slack + persistence sync | `tests/unit/a02-triageLogic.overrides.test.js` (`applyCurrentSprintRotation ... roles change`) | covered | Core override-apply behavior covered. |
| No-op apply when roles unchanged | `updated=false`, no side effects | `tests/unit/a02-triageLogic.overrides.test.js` (`... roles match current state`) | covered | No-op branch pinned. |
| Admin-set roles apply | `updated=true`, affected users returned, side effects executed | `tests/unit/a02-triageLogic.overrides.test.js` (`setCurrentSprintRolesFromAdmin ... differ`) | covered | Core admin path covered. |
| Admin-set roles no-op | `updated=false`, no side effects | `tests/unit/a02-triageLogic.overrides.test.js` (`... match current state`) | covered | No-op branch pinned. |
| Repository override CRUD mapping | DB rows map correctly and approve/decline/delete paths behave | `tests/unit/a01-repository.overrides.test.js` | covered | Good mapping + transaction-path checks. |
| `getSprintUsers` persisted-vs-calculated policy | Uses persisted current sprint by default, supports calculated override mode | `tests/unit/a00-dataUtils.overrides.test.js` | covered | High-risk policy branch covered. |
| DB error handling for `readOverrides` | Returns deterministic fallback behavior when repository throws | none | gap | Important degradation branch not pinned. |

## Bias-Control Addenda (Test Targets)

| Bias risk | Needed test target | Priority |
| --- | --- | --- |
| Timezone boundary bias | PT/DST edge case tests for defer/next business day and sprint transitions | high |
| Contract drift bias | Contract test for Railway response schema and cron config coupling | high |
| Mock realism bias | Partial dependency failure tests (Slack fails after snapshot save, repository transient error) | medium |
| Order-dependence bias | Determinism check that compares stabilized vs serial behavior in CI | high |

