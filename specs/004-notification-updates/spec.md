# Feature Specification: Notification Policy Refresh

**Feature Branch**: `004-notification-updates`  
**Created**: 2025-11-10  
**Status**: Draft  
**Input**: User description: "we need to do some updates to how the triage bot handles notifications."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quiet On-Call Notifications (Priority: P1)

As a rotating on-call team member, I only want to receive Slack notifications when my duty assignment actually changes so that I can trust that every alert contains new information.

**Why this priority**: Preventing redundant alerts is the highest-impact improvement because noise is eroding confidence in the bot and causing users to ignore important updates.

**Independent Test**: Trigger the daily notification workflow with unchanged rotation data; verify no outbound Slack messages are queued or sent.

**Acceptance Scenarios**:

1. **Given** the daily rotation snapshot matches the prior sent snapshot, **When** the notification job runs, **Then** no Slack DM or channel message is generated.
2. **Given** at least one discipline assignment differs from the prior snapshot, **When** the notification job runs, **Then** only the affected users are notified with the updated duty details.

---

### User Story 2 - Railway-Orchestrated Scheduling (Priority: P2)

As an operations engineer, I need the daily rotation notification to be scheduled through Railway cron so that the job runs reliably independent of application restarts.

**Why this priority**: Migrating to Railway cron removes a class of missed notifications caused by in-app schedulers being paused during deployments or crashes.

**Independent Test**: Enable the Railway cron schedule and observe that the notification workflow triggers at the configured time without relying on in-app timers.

**Acceptance Scenarios**:

1. **Given** the Railway cron job is enabled, **When** the scheduled time occurs, **Then** the notification workflow executes once via Railway infrastructure.
2. **Given** the application process restarts, **When** the next scheduled time occurs, **Then** Railway cron still triggers the workflow without requiring additional manual setup.

---

### User Story 3 - Weekday Delivery Guardrails (Priority: P3)

As an on-call team member, I only want to receive duty notifications on weekdays so that I am not pinged during weekends unless there is an urgent override.

**Why this priority**: Reducing weekend pings improves work-life balance while aligning notifications with weekday rotation boundaries.

**Independent Test**: Simulate a job run on Saturday and verify that notifications are deferred until the next Monday morning.

**Acceptance Scenarios**:

1. **Given** the job runs on a Saturday or Sunday, **When** the workflow evaluates delivery rules, **Then** it defers user notifications until the next weekday window.
2. **Given** the job runs on Monday after a weekend, **When** a user’s assignment changed during the weekend, **Then** the Monday notification summarizes the change once for the upcoming week.

---

### Edge Cases

- How are notifications handled on observed holidays that fall on weekdays, and do they defer to the next working day?
- What happens if Railway cron triggers while an override request is being approved—does the workflow re-evaluate after the override finalizes?
- How does the system reconcile multiple missed executions (e.g., Railway outage) to avoid spamming users when service resumes?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST compare the upcoming rotation assignments against the last delivered notification snapshot and suppress messages when no differences exist.
- **FR-002**: The system MUST surface only the disciplines and users whose assignments changed in the notification payload.
- **FR-003**: The system MUST schedule the daily notification workflow through Railway’s cron service at the configured Pacific Time slot.
- **FR-004**: The system MUST ensure that only a single execution of the notification workflow occurs per scheduled Railway cron trigger.
- **FR-005**: The system MUST block delivery of routine notifications on Saturdays and Sundays, queuing any changes for the next weekday delivery window.
- **FR-006**: The system MUST include carry-over changes (e.g., weekend adjustments) in the next weekday notification so that users receive a consolidated update.
- **FR-007**: The system MUST record whether a notification was skipped, deferred, or delivered to support operational auditing.

### Key Entities *(include if feature involves data)*

- **NotificationSnapshot**: Represents the set of rotation assignments most recently delivered to users, including timestamp, discipline assignments, and delivery status flags.
- **DeliveryWindowPolicy**: Captures allowed delivery days, timezone specifics, and deferral logic for weekends or holidays.
- **CronTriggerAudit**: Records each Railway cron invocation, execution status, and resulting action (skipped, deferred, delivered).

### Assumptions & Dependencies

- The Railway environment for the triage bot has permissions to create and manage cron schedules aligned with Pacific Time.
- Rotation source data (sprints, overrides, current state) is refreshed before the Railway cron window each weekday so comparisons are accurate.
- Weekend changes that occur after Friday’s notification remain stored in the data source and can be surfaced in the next weekday run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of identical-day rotation snapshots result in zero Slack notifications (no duplicate messages).
- **SC-002**: Railway cron executes the notification workflow on the configured weekday schedule with at least 99% success over a rolling 30-day period.
- **SC-003**: 0 routine duty notifications are delivered on Saturdays or Sundays during a 30-day verification window.
- **SC-004**: Post-launch surveys or support feedback indicate at least a 50% reduction in user complaints about noisy or redundant notifications within one sprint.
