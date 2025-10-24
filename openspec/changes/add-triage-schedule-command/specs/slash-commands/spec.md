## ADDED Requirements

### Requirement: Triage Schedule Query Command
The system SHALL provide a `/triage-schedule` slash command that allows users to query who will be on call on a specific date.

#### Scenario: Environment-specific command naming
- **WHEN** the system is running in staging environment (`ENVIRONMENT=staging` or `APP_ENV=staging`)
- **THEN** the command name becomes `/triage-schedule-staging`

#### Scenario: Production environment command naming
- **WHEN** the system is running in production environment (no staging environment variables set)
- **THEN** the command name remains `/triage-schedule`

#### Scenario: User queries schedule for future date
- **WHEN** user executes `/triage-schedule` command
- **THEN** system opens a modal with a date picker for date selection

#### Scenario: User selects date and views assignments
- **WHEN** user selects a date in the modal and submits
- **THEN** system displays a modal showing who will be on call for each discipline on that date

#### Scenario: Date validation for past dates
- **WHEN** user selects a date in the past
- **THEN** system shows an error message indicating only future dates are allowed

#### Scenario: Date validation for invalid dates
- **WHEN** user selects an invalid date format
- **THEN** system shows an error message with proper date format guidance

#### Scenario: No assignments found for date
- **WHEN** user selects a date with no scheduled assignments
- **THEN** system displays a message indicating no assignments found for that date

#### Scenario: Display assignments with discipline information
- **WHEN** assignments are found for the selected date
- **THEN** system displays each discipline with the assigned team member's name and Slack ID

### Requirement: Environment-specific Command Naming
The system SHALL provide environment-specific naming for all slash commands to ensure uniqueness across environments.

#### Scenario: Staging environment commands
- **WHEN** the system is running in staging environment (`ENVIRONMENT=staging` or `APP_ENV=staging`)
- **THEN** all slash commands append `-staging` suffix (e.g., `/admin-sprints-staging`, `/triage-override-staging`)

#### Scenario: Production environment commands
- **WHEN** the system is running in production environment (no staging environment variables set)
- **THEN** all slash commands use their base names (e.g., `/admin-sprints`, `/triage-override`)

### Requirement: Date-based Rotation Calculation
The system SHALL calculate rotation assignments based on sprint schedules and discipline rosters for any given future date.

#### Scenario: Calculate assignments for date within current sprint
- **WHEN** requested date falls within current sprint period
- **THEN** system returns current sprint assignments

#### Scenario: Calculate assignments for date in future sprint
- **WHEN** requested date falls within a future sprint period
- **THEN** system calculates assignments based on sprint index and discipline rotation logic

#### Scenario: Handle date outside sprint schedule
- **WHEN** requested date falls outside any configured sprint period
- **THEN** system indicates no assignments available for that date
