# Data Model: Prisma Mapping

## Entities and Prisma Models

- User
  - Fields: id (string/UUID), slackId, name, disciplines[]
  - Notes: Many-to-many with Discipline via join table

- Discipline
  - Fields: id, name

- Sprint
  - Fields: id, sprintIndex (int), sprintName, startDate, endDate

- Assignment
  - Fields: id, sprintId → Sprint, userId → User, role

- Override
  - Fields: id, userId → User, role, startAt, endAt, reason

- AuditLog
  - Fields: id, createdAt, action, payload (JSON)

- CronTriggerAudit (existing)
  - Fields: id (UUID), triggeredAt, scheduledAt, result, details (JSON)

- NotificationSnapshot (existing)
  - Fields: id, capturedAt, disciplineAssignments (JSON), hash, deliveryStatus, deliveryReason, railwayTriggerId → CronTriggerAudit

## Migration History

- Prisma manages `_prisma_migrations` table with applied migrations and checksums

## Validation Rules

- Unique: User.slackId, Discipline.name, Sprint.sprintIndex
- Foreign keys: Assignment.sprintId, .userId; NotificationSnapshot.railwayTriggerId
- Enum candidates: roles, deliveryStatus, cron result

## Notes

- Initial schema will align with existing SQL tables; use Prisma enums where applicable
- Relation onDelete behavior mirrors current constraints (e.g., SET NULL for snapshots → cron audits)
