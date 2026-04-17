## ADDED Requirements

### Requirement: Release Team Membership Flag
The system SHALL store a per-user, per-discipline release-team signifier in the persisted user model.

#### Scenario: New user rows default to not on release team
- **WHEN** a user row is created without an explicit release-team value
- **THEN** the stored value is `false`

#### Scenario: Admin toggles release-team participation
- **WHEN** an admin enables or disables release-team participation for a discipline member
- **THEN** the member row is updated with the new release-team flag
- **AND** subsequent release-team computation uses that value

### Requirement: Day-Before Sprint Release Update Predicate
The system SHALL evaluate release-team updates daily at a fixed Pacific wall time and only execute when tomorrow in Pacific time matches a sprint start date.

#### Scenario: No sprint starts tomorrow
- **WHEN** the daily release-team job runs and no sprint has `startDate == tomorrow PT`
- **THEN** the job performs no Slack group mutation
- **AND** returns a no-op/skipped outcome

#### Scenario: Sprint starts tomorrow
- **WHEN** the daily release-team job runs and exactly one sprint `S` has `startDate == tomorrow PT`
- **THEN** the system computes release-team membership using sprint `S` assignments
- **AND** attempts Slack release-team synchronization

### Requirement: Release Team User Group Synchronization
The system SHALL manage release-team Slack user-group membership using full replace semantics.

#### Scenario: Non-empty computed member set
- **WHEN** computed release-team Slack user IDs are non-empty
- **THEN** the system calls Slack `usergroups.users.update` with the deduped canonical list
- **AND** users not in that list are removed from the user group

#### Scenario: Empty computed member set
- **WHEN** computed release-team Slack user IDs are empty
- **THEN** the system SHALL NOT call `usergroups.users.update`
- **AND** existing Slack user-group membership remains unchanged
- **AND** the system logs a warning

### Requirement: Staging Safety for Release User Group
The system SHALL isolate staging release-team updates from production Slack assets.

#### Scenario: Staging environment release update
- **WHEN** `APP_ENV=staging`
- **THEN** the system uses `SLACK_RELEASE_TEAM_USERGROUP_ID_STAGING` for release-group updates
- **AND** it SHALL NOT use `SLACK_RELEASE_TEAM_USERGROUP_ID` in staging

### Requirement: Optional Release Channel Topic Update
The system MAY update a configured releases channel topic with the computed release-team mentions.

#### Scenario: Topic update configured
- **WHEN** `RELEASES_CHANNEL_ID` is configured and release-team membership is computed
- **THEN** the system attempts to update the channel topic with the computed members
- **AND** topic update failure does not roll back user-group membership updates
