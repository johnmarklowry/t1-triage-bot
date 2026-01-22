# Data Model: Refactored Prisma Schema

**Date**: 2025-01-27  
**Feature**: Refactor Prisma Schema  
**Purpose**: Define the refactored data model with consistent naming and organization

## Model Organization

The schema is organized into three logical groups:

1. **Core Business Entities**: Sprint, User, CurrentState
2. **Workflow Models**: Override
3. **System Models**: AuditLog, Discipline, Migration

## Entity Definitions

### Core Business Entities

#### Sprint
**Purpose**: Represents a sprint schedule with start/end dates and index

**Fields**:
- `id` (Int, PK, autoincrement): Primary key
- `sprintName` (String, VarChar(50)): Name of the sprint
- `startDate` (DateTime, Date): Sprint start date
- `endDate` (DateTime, Date): Sprint end date
- `sprintIndex` (Int, unique): Unique sprint index for ordering
- `createdAt` (DateTime?, Timestamp): Record creation timestamp
- `updatedAt` (DateTime?, Timestamp): Record last update timestamp

**Relationships**:
- One-to-many with CurrentState (via `sprintIndex`)

**Indexes**:
- `idx_Sprint_sprintIndex`: On `sprintIndex` (unique)
- `idx_Sprint_startDate_endDate`: Composite on `startDate`, `endDate`

**Database Mapping**:
- Model name: `Sprint` → Table: `sprints` (via `@@map("sprints")`)
- Field `sprintName` → Column: `sprint_name` (via `@map("sprint_name")`)
- Field `startDate` → Column: `start_date` (via `@map("start_date")`)
- Field `endDate` → Column: `end_date` (via `@map("end_date")`)
- Field `sprintIndex` → Column: `sprint_index` (via `@map("sprint_index")`)
- Field `createdAt` → Column: `created_at` (via `@map("created_at")`)
- Field `updatedAt` → Column: `updated_at` (via `@map("updated_at")`)

---

#### User
**Purpose**: Represents user information with Slack ID and discipline assignments

**Fields**:
- `id` (Int, PK, autoincrement): Primary key
- `slackId` (String, VarChar(50), unique): Slack user ID
- `name` (String, VarChar(100)): User's display name
- `discipline` (String, VarChar(20)): User's discipline/role
- `createdAt` (DateTime?, Timestamp): Record creation timestamp
- `updatedAt` (DateTime?, Timestamp): Record last update timestamp

**Relationships**:
- None explicitly defined (referenced by Slack IDs in other models)

**Constraints**:
- Unique constraint on `slackId`
- Unique constraint on composite (`slackId`, `discipline`)

**Indexes**:
- `idx_User_slackId`: On `slackId` (unique)
- `idx_User_discipline`: On `discipline`

**Database Mapping**:
- Model name: `User` → Table: `users` (via `@@map("users")`)
- Field `slackId` → Column: `slack_id` (via `@map("slack_id")`)
- Field `createdAt` → Column: `created_at` (via `@map("created_at")`)
- Field `updatedAt` → Column: `updated_at` (via `@map("updated_at")`)

---

#### CurrentState
**Purpose**: Represents the single current active sprint and role assignments (singleton pattern - only one record with id=1)

**Fields**:
- `id` (Int, PK, unique, autoincrement): Primary key (constrained to 1)
- `sprintIndex` (Int?, FK): Reference to current sprint
- `accountSlackId` (String?, VarChar(50)): Slack ID for account role
- `producerSlackId` (String?, VarChar(50)): Slack ID for producer role
- `poSlackId` (String?, VarChar(50)): Slack ID for PO role
- `uiEngSlackId` (String?, VarChar(50)): Slack ID for UI engineer role
- `beEngSlackId` (String?, VarChar(50)): Slack ID for BE engineer role
- `updatedAt` (DateTime?, Timestamp): Record last update timestamp

**Relationships**:
- Many-to-one with Sprint (via `sprintIndex`)

**Constraints**:
- Unique constraint ensuring only one record exists (id = 1)

**Database Mapping**:
- Model name: `CurrentState` → Table: `current_state` (via `@@map("current_state")`)
- All field names map to snake_case column names

---

### Workflow Models

#### Override
**Purpose**: Represents coverage override requests and approvals for sprint assignments

**Fields**:
- `id` (Int, PK, autoincrement): Primary key
- `sprintIndex` (Int, FK): Reference to sprint
- `role` (String, VarChar(20)): Role being overridden
- `originalSlackId` (String?, VarChar(50)): Original assigned Slack ID
- `replacementSlackId` (String, VarChar(50)): Replacement Slack ID
- `replacementName` (String?, VarChar(100)): Replacement user's name
- `requestedBy` (String, VarChar(50)): Slack ID of requester
- `approved` (Boolean?, default: false): Approval status
- `approvedBy` (String?, VarChar(50)): Slack ID of approver
- `approvalTimestamp` (DateTime?, Timestamp): When approval occurred
- `createdAt` (DateTime?, Timestamp): Record creation timestamp
- `updatedAt` (DateTime?, Timestamp): Record last update timestamp

**Relationships**:
- Many-to-one with Sprint (via `sprintIndex`)

**Constraints**:
- Unique constraint on composite (`sprintIndex`, `role`, `requestedBy`, `replacementSlackId`)

**Indexes**:
- `idx_Override_approved`: On `approved`
- `idx_Override_sprintIndex_role`: Composite on `sprintIndex`, `role`

**Database Mapping**:
- Model name: `Override` → Table: `overrides` (via `@@map("overrides")`)
- All field names map to snake_case column names

---

### System Models

#### AuditLog
**Purpose**: Tracks all changes to database records for compliance and debugging

**Fields**:
- `id` (Int, PK, autoincrement): Primary key
- `tableName` (String, VarChar(50)): Name of table that was modified
- `recordId` (Int?): ID of the record that was modified
- `operation` (String, VarChar(20)): Type of operation (INSERT, UPDATE, DELETE, etc.)
- `oldValues` (Json?): Previous values before change
- `newValues` (Json?): New values after change
- `changedBy` (String?, VarChar(50)): User/system that made the change
- `changedAt` (DateTime?, Timestamp, default: now()): When the change occurred
- `reason` (String?): Optional reason for the change

**Relationships**:
- None (audit trail is independent)

**Indexes**:
- `idx_AuditLog_changedAt`: On `changedAt`
- `idx_AuditLog_tableName_recordId`: Composite on `tableName`, `recordId`

**Database Mapping**:
- Model name: `AuditLog` → Table: `audit_logs` (via `@@map("audit_logs")`)
- All field names map to snake_case column names

---

#### Discipline
**Purpose**: Represents discipline definitions per environment

**Fields**:
- `id` (String, PK, cuid()): Primary key (CUID)
- `name` (String): Discipline name
- `env` (String, VarChar(16)): Environment (staging, production)

**Relationships**:
- None explicitly defined

**Constraints**:
- Unique constraint on composite (`name`, `env`)

**Database Mapping**:
- Model name: `Discipline` → Table: `discipline` (via `@@map("discipline")`)

**Note**: This model uses CUID for ID generation, which differs from other models. Consider migrating to autoincrement if not breaking.

---

#### Migration
**Purpose**: Custom migration tracking table (if still needed - requires verification)

**Fields**:
- `id` (Int, PK, autoincrement): Primary key
- `filename` (String, VarChar(255), unique): Migration filename
- `executedAt` (DateTime?, Timestamp): When migration was executed
- `checksum` (String?, VarChar(64)): Migration file checksum

**Relationships**:
- None

**Database Mapping**:
- Model name: `Migration` → Table: `migrations` (via `@@map("migrations")`)
- All field names map to snake_case column names

**Note**: This appears to be a custom migration tracking table. Prisma has its own `_prisma_migrations` table. Verify if this table is still needed or can be deprecated.

---

## Naming Convention Summary

### Model Names (PascalCase)
- `audit_logs` → `AuditLog`
- `current_state` → `CurrentState`
- `sprints` → `Sprint`
- `overrides` → `Override`
- `users` → `User`
- `discipline` → `Discipline`
- `migrations` → `Migration`

### Field Names (camelCase)
- All snake_case field names converted to camelCase
- Examples: `table_name` → `tableName`, `sprint_index` → `sprintIndex`, `created_at` → `createdAt`

### Index Names
- Pattern: `idx_ModelName_fieldName` or `idx_ModelName_field1_field2`
- Examples: `idx_User_slackId`, `idx_AuditLog_tableName_recordId`

## Relationship Summary

1. **Sprint ↔ CurrentState**: One-to-many (one sprint can have multiple current state records, though typically only one active)
2. **Sprint ↔ Override**: One-to-many (one sprint can have multiple overrides)

## Migration Strategy

All model and field names will use `@@map` and `@map` attributes to maintain backward compatibility with existing database tables and columns. This allows:
- Refactored Prisma schema with new naming conventions
- Existing database structure remains unchanged
- Application code can be gradually updated to use new Prisma client types
- Optional future migration to rename database objects if desired








