## ADDED Requirements

### Requirement: Admin-editable severity context overlay

The system SHALL allow authorized admins to persist supplementary SLA / glossary text that is merged with the default `sla-guidelines.json` when producing severity assessments and judge prompts.

#### Scenario: Overlay absent

- **WHEN** no overlay exists in the database
- **THEN** assessments SHALL use only `sla-guidelines.json` as today

#### Scenario: Overlay present

- **WHEN** a valid overlay exists
- **THEN** merged guidelines SHALL be passed to generator and judge prompts according to documented precedence (overlay wins on conflicting keys or sections as specified in design)

#### Scenario: Unauthorized edit attempt

- **WHEN** a user who is not in the configured admin channel attempts to open or submit the severity context editor
- **THEN** the system SHALL deny access consistent with other Admin Hub tools
