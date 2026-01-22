# Feature Specification: Prevent Migration Dependency Errors

**Feature Branch**: `009-fix-migration-dependencies`  
**Created**: 2025-11-15  
**Status**: Draft  
**Input**: User description: "i'm getting this error in the logs on railway: [MIGRATION] Migration failed: error: relation \"cron_trigger_audits\" does not exist"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Successful Migration Execution (Priority: P1)

As a system administrator deploying the application, I need migrations to execute successfully without dependency errors, so that the application can start correctly and the database schema is properly initialized.

**Why this priority**: This is a critical blocker that prevents the application from starting. Without working migrations, the application cannot function in production environments.

**Independent Test**: Can be fully tested by running migrations on a fresh database and verifying all tables are created correctly with proper foreign key relationships.

**Acceptance Scenarios**:

1. **Given** a fresh database with no existing tables, **When** migrations are executed, **Then** all tables are created successfully with correct foreign key relationships
2. **Given** a database where some migrations have already run, **When** new migrations are executed, **Then** only pending migrations run and complete successfully
3. **Given** a migration that creates a table with a foreign key reference, **When** the migration executes, **Then** the referenced table exists before the foreign key constraint is created

---

### User Story 2 - Migration Dependency Validation (Priority: P1)

As a developer creating new migrations, I need the system to validate that migration dependencies are correct before execution, so that I can catch dependency errors during development rather than in production.

**Why this priority**: Preventing errors at development time is more efficient and reduces production incidents. This helps maintain code quality and prevents deployment failures.

**Independent Test**: Can be fully tested by creating a test migration with invalid dependencies and verifying the system detects and reports the issue before execution.

**Acceptance Scenarios**:

1. **Given** a migration file that references a table that doesn't exist, **When** migrations are validated, **Then** the system detects the missing dependency and reports an error
2. **Given** migrations are executed in order, **When** a migration references a table created in a later migration, **Then** the system detects the dependency violation and prevents execution
3. **Given** all migrations have correct dependencies, **When** migrations are validated, **Then** the system confirms all dependencies are satisfied

---

### User Story 3 - Clear Error Reporting (Priority: P2)

As a system administrator troubleshooting migration failures, I need clear error messages that identify the specific dependency issue, so that I can quickly understand and resolve the problem.

**Why this priority**: While not blocking functionality, clear error messages significantly reduce troubleshooting time and improve operational efficiency.

**Independent Test**: Can be fully tested by intentionally creating a migration with dependency errors and verifying the error message clearly identifies the missing table or constraint.

**Acceptance Scenarios**:

1. **Given** a migration fails due to a missing table reference, **When** the error is reported, **Then** the error message clearly identifies which table is missing and which migration requires it
2. **Given** a migration fails due to a foreign key constraint issue, **When** the error is reported, **Then** the error message identifies both the referencing table and the missing referenced table
3. **Given** multiple migration files with dependency issues, **When** validation runs, **Then** all issues are reported together with clear identification of each problem

---

### Edge Cases

- What happens when a migration creates a table and then immediately references it in the same migration file?
- How does the system handle migrations that create tables conditionally (e.g., `CREATE TABLE IF NOT EXISTS`)?
- What happens if a migration is partially executed (some statements succeed, others fail)?
- How does the system handle migrations that drop and recreate tables with foreign key relationships?
- What happens when migrations reference tables that exist but were created outside the migration system?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST validate that all table references in migrations exist before executing foreign key constraints
- **FR-002**: System MUST ensure referenced tables are created before tables that reference them in the same migration file
- **FR-003**: System MUST detect and report dependency violations before executing migrations
- **FR-004**: System MUST provide clear error messages identifying missing tables, constraints, or dependencies
- **FR-005**: System MUST handle migrations that create multiple tables with inter-dependencies correctly
- **FR-006**: System MUST validate migration dependencies across multiple migration files (not just within a single file)
- **FR-007**: System MUST ensure foreign key constraints are created only after the referenced table exists in the database
- **FR-008**: System MUST support migrations that use conditional table creation (e.g., `CREATE TABLE IF NOT EXISTS`)
- **FR-009**: System MUST maintain transaction integrity - if any statement in a migration fails, the entire migration must roll back
- **FR-010**: System MUST validate that migration execution order matches dependency requirements

### Key Entities

- **Migration File**: Represents a single migration script containing SQL statements to modify database schema
- **Table Dependency**: Represents a relationship where one table (or constraint) requires another table to exist first
- **Foreign Key Constraint**: Represents a database constraint that references another table and must be created after the referenced table exists

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of migrations execute successfully without dependency errors on fresh database installations
- **SC-002**: Migration dependency validation detects 100% of invalid table references before execution
- **SC-003**: Error messages clearly identify the missing dependency (table name and migration file) in 100% of dependency failure cases
- **SC-004**: Migration execution time increases by less than 10% due to dependency validation overhead
- **SC-005**: Zero production deployment failures due to migration dependency errors after implementation

## Assumptions

- Migration files are executed in alphabetical/numerical order
- Each migration file may contain multiple SQL statements
- Foreign key constraints are validated immediately upon table creation in PostgreSQL
- The migration system uses database transactions to ensure atomicity
- Developers may create migrations that reference tables created in the same migration file
- Some migrations may use conditional creation statements (`CREATE TABLE IF NOT EXISTS`)

## Dependencies

- Existing migration system (`db/migrate.js`)
- PostgreSQL database with support for foreign key constraints
- SQL statement parsing and execution infrastructure

## Out of Scope

- Changing the migration file naming or ordering system
- Modifying how migrations are tracked in the database
- Adding support for circular dependencies between migrations
- Performance optimization beyond the 10% overhead target
- Migration rollback functionality (down migrations)
