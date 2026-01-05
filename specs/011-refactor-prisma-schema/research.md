# Research: Prisma Schema Refactoring Best Practices

**Date**: 2025-01-27  
**Feature**: Refactor Prisma Schema  
**Purpose**: Research Prisma best practices for schema organization, naming conventions, and migration strategies

## Naming Conventions

### Decision: Use PascalCase for Models, camelCase for Fields

**Rationale**: 
- Prisma's official documentation and community best practices recommend PascalCase for model names (e.g., `User`, `AuditLog`) and camelCase for field names (e.g., `firstName`, `tableName`)
- This convention aligns with TypeScript/JavaScript naming standards and improves code readability
- Generated Prisma client types will follow these conventions, providing consistent developer experience

**Alternatives considered**:
- snake_case for both models and fields: Rejected - Not aligned with Prisma/TypeScript conventions, makes generated client types inconsistent with JavaScript naming
- camelCase for models: Rejected - Prisma convention is PascalCase for models to distinguish them from field names

**Implementation**: 
- Convert all model names from snake_case to PascalCase (e.g., `audit_logs` → `AuditLog`)
- Convert all field names from snake_case to camelCase (e.g., `table_name` → `tableName`)
- Use `@@map` attribute to map Prisma model names to existing database table names during migration
- Use `@map` attribute to map Prisma field names to existing database column names

## Schema Organization

### Decision: Group Models Logically with Section Comments

**Rationale**:
- Logical grouping improves schema readability and helps developers understand relationships
- Section comments provide context for each group of related models
- Recommended organization: Core entities first, then supporting/auxiliary models

**Alternatives considered**:
- Alphabetical ordering: Rejected - Doesn't reflect relationships and business logic
- Single flat list: Rejected - Harder to understand model relationships and purpose

**Implementation**:
- Group 1: Core Business Entities (Sprint, User, CurrentState)
- Group 2: Workflow Models (Override)
- Group 3: System Models (AuditLog, Discipline, Migration)

## Field Organization

### Decision: Consistent Field Ordering Within Models

**Rationale**:
- Consistent ordering (id → business fields → timestamps → relations) improves readability
- Makes it easier to locate specific types of fields
- Aligns with common database schema documentation practices

**Implementation**:
1. Primary key (id)
2. Business/domain fields
3. Timestamp fields (createdAt, updatedAt)
4. Foreign key fields (if not using implicit relations)
5. Relation fields (at the end)

## Relationship Definitions

### Decision: Explicitly Define All Relationships Using Prisma Relation Syntax

**Rationale**:
- Explicit relationships enable Prisma's powerful relation queries (`include`, `select`)
- Improves type safety in generated client
- Makes schema self-documenting
- Ensures referential integrity through proper `onDelete` and `onUpdate` actions

**Alternatives considered**:
- Implicit relationships via foreign keys only: Rejected - Loses Prisma relation query capabilities and type safety

**Implementation**:
- Define bidirectional relations where appropriate
- Use proper `onDelete` actions (Cascade, SetNull, Restrict, NoAction) based on business logic
- Use `onUpdate` actions (Cascade, Restrict, NoAction) for referential integrity

## Index Naming

### Decision: Use Consistent Index Naming Pattern

**Rationale**:
- Consistent naming makes indexes easier to identify and manage
- Pattern: `idx_ModelName_fieldName` or `idx_ModelName_fields` for composite indexes
- Improves database administration and debugging

**Implementation**:
- Single field indexes: `idx_ModelName_fieldName` (e.g., `idx_User_slackId`)
- Composite indexes: `idx_ModelName_field1_field2` (e.g., `idx_AuditLog_tableName_recordId`)
- Unique constraints: Keep existing unique constraint names or use descriptive names

## Migration Strategy

### Decision: Use Prisma Migrate with `@@map` and `@map` for Backward Compatibility

**Rationale**:
- Prisma Migrate provides versioned, trackable schema changes
- `@@map` and `@map` allow renaming in Prisma schema without changing database table/column names
- Enables gradual migration: schema refactoring first, then optional database renaming later
- Maintains zero downtime and backward compatibility

**Alternatives considered**:
- Direct database renaming: Rejected - Requires downtime, breaks existing queries, high risk
- Big-bang migration: Rejected - Too risky, no rollback path

**Implementation**:
1. Refactor Prisma schema with new naming conventions
2. Use `@@map` to map new model names to existing table names
3. Use `@map` to map new field names to existing column names
4. Generate migration - Prisma will detect no actual database changes needed
5. Regenerate Prisma client - new naming in code, old naming in database
6. Update application code to use new Prisma client types
7. (Optional future step) Create migration to rename database tables/columns if desired

## ID Generation Strategy

### Decision: Use `@default(autoincrement())` Consistently for PostgreSQL

**Rationale**:
- PostgreSQL SERIAL/BIGSERIAL is the standard for auto-incrementing IDs
- More efficient than CUID for sequential integer IDs
- Consistent with existing schema (except Discipline model which uses CUID)

**Alternatives considered**:
- CUID for all models: Rejected - Less efficient for integer primary keys, inconsistent with existing data
- UUID: Rejected - Not needed for internal IDs, adds complexity

**Implementation**:
- Keep `autoincrement()` for all integer ID fields
- Consider migrating Discipline model from CUID to autoincrement if not breaking (requires research on existing data)

## Documentation

### Decision: Add Comprehensive Comments to Each Model

**Rationale**:
- Comments explain model purpose and usage without external documentation
- Improves onboarding for new developers
- Documents business logic and constraints

**Implementation**:
- Add `///` comments above each model explaining its purpose
- Document any special constraints or patterns (e.g., singleton pattern for CurrentState)
- Explain relationships and their business meaning

## Check Constraints

### Decision: Remove Comment References to Unimplemented Check Constraints

**Rationale**:
- Comments mentioning check constraints that aren't implemented are misleading
- Either implement constraints properly or remove the comments
- Prisma doesn't support check constraints directly; they must be added via raw SQL migrations

**Implementation**:
- Review all check constraint comments
- For constraints that should exist: Create raw SQL migration to add them
- For constraints that aren't needed: Remove the comments
- Document any constraints in model comments

## Custom Migration Table

### Decision: Document or Remove the `migrations` Model

**Rationale**:
- The `migrations` model appears to be a custom migration tracking table
- Prisma has its own migration tracking in `_prisma_migrations` table
- Need to determine if this custom table is still needed

**Implementation**:
- Research if `migrations` table is used by application code
- If unused: Remove from schema (or mark as deprecated)
- If used: Document its purpose clearly in comments
- Consider migrating to Prisma's built-in migration tracking if appropriate








