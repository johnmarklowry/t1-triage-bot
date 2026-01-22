# Implementation Plan: Prevent Migration Dependency Errors

**Branch**: `009-fix-migration-dependencies` | **Date**: 2025-11-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-fix-migration-dependencies/spec.md`

## Summary

This feature adds dependency validation and statement reordering to the migration system to prevent foreign key constraint errors. The system will parse SQL migrations to detect table dependencies, validate that referenced tables exist before creating foreign key constraints, and reorder statements within migrations when necessary. This ensures migrations execute successfully even when tables are created and referenced in the same migration file.

## Technical Context

**Language/Version**: Node.js 18+ (CommonJS)  
**Primary Dependencies**: pg (PostgreSQL client), pg-pool (connection pooling)  
**Storage**: PostgreSQL database  
**Testing**: Manual testing via test routes, integration testing with test database  
**Target Platform**: Railway deployment (Linux), local development (macOS/Linux)  
**Project Type**: Single Node.js application  
**Performance Goals**: Migration validation adds <10% overhead to migration execution time  
**Constraints**: Must maintain backward compatibility with existing migrations, must not break existing migration execution flow  
**Scale/Scope**: ~10 migration files, handles migrations with up to 50 SQL statements per file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with Triage Rotation Bot Constitution principles:

- **I. Slack API Compliance**: ✅ N/A - This feature does not interact with Slack APIs
- **II. Code Maintainability**: ✅ Compliant - Migration validation logic will be well-documented with clear function purposes and inline comments for SQL parsing logic
- **III. Error Handling & Resilience**: ✅ Compliant - All validation errors will be logged with context (migration file, statement, missing dependency). Migration execution will fail gracefully with clear error messages
- **IV. Security & Configuration**: ✅ Compliant - No new secrets or configuration values required. SQL parsing uses read-only operations on migration files
- **V. Documentation & Testing**: ✅ Compliant - Feature will be documented in code comments and migration system documentation. Test routes will be available for manual validation. Migration validation can be tested with test migration files

**Compliance Status**: ✅ Compliant

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-migration-dependencies/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
db/
├── migrate.js                    # Enhanced with dependency validation
├── connection.js                 # No changes required
└── migrations/                   # Existing migration files (no changes)
    ├── 001_initial_schema.sql
    ├── 002_fix_duplicate_key_constraints.sql
    ├── 003_add_pending_to_cron_audit_result.sql
    └── 004_create_notification_snapshots.sql

# New utility module for SQL parsing and dependency detection
db/
└── migrationValidator.js         # New: SQL parsing, dependency detection, statement reordering
```

**Structure Decision**: Single project structure maintained. New `migrationValidator.js` module added to `db/` directory to keep migration-related code together. Existing `migrate.js` will be enhanced to use the validator.

## Complexity Tracking

> **No violations - all complexity is justified by requirements**
