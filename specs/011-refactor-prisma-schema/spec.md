# Feature Specification: Refactor Prisma Schema

**Feature Branch**: `011-refactor-prisma-schema`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Can we go through and rework the prisma schema so that everything is organized and follow best practice."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Naming and Organization (Priority: P1)

As a developer working with the Prisma schema, I need consistent naming conventions and logical organization so I can quickly understand the data model and avoid errors when writing queries.

**Why this priority**: Inconsistent naming leads to confusion, bugs, and slower development. Following Prisma best practices ensures maintainability and reduces cognitive load.

**Independent Test**: A developer can read the schema file and immediately understand the data model structure, relationships, and naming patterns without referring to external documentation.

**Acceptance Scenarios**:

1. **Given** the refactored schema, **When** I read the model definitions, **Then** all models use PascalCase naming (e.g., `AuditLog`, `CurrentState`) and all fields use camelCase (e.g., `tableName`, `recordId`)
2. **Given** the refactored schema, **When** I look for related models, **Then** models are grouped logically with clear documentation explaining their purpose and relationships
3. **Given** the refactored schema, **When** I generate the Prisma client, **Then** the generated types follow consistent naming patterns matching the schema

---

### User Story 2 - Complete and Proper Relationships (Priority: P1)

As a developer querying data, I need properly defined relationships between models so I can use Prisma's relation features and ensure referential integrity.

**Why this priority**: Missing or incomplete relationships prevent using Prisma's powerful relation queries and can lead to data integrity issues.

**Independent Test**: A developer can use Prisma's `include` and `select` features to query related data without writing manual joins.

**Acceptance Scenarios**:

1. **Given** the refactored schema, **When** I query a Sprint with related CurrentState, **Then** I can use Prisma's relation syntax (e.g., `sprint.currentState`) without manual joins
2. **Given** the refactored schema, **When** I create an Override, **Then** the relationship to Sprint is properly defined and enforced
3. **Given** the refactored schema, **When** I query Users, **Then** relationships to other models (if any) are clearly defined and accessible

---

### User Story 3 - Clear Documentation and Field Organization (Priority: P2)

As a developer or new team member, I need clear documentation and logically organized fields in each model so I can understand the data structure without reading code.

**Why this priority**: Good documentation and organization reduce onboarding time and prevent misunderstandings about data structure.

**Independent Test**: A new developer can understand what each model represents and what each field means by reading the schema file alone.

**Acceptance Scenarios**:

1. **Given** the refactored schema, **When** I read a model definition, **Then** each model has a clear comment explaining its purpose and usage
2. **Given** the refactored schema, **When** I look at field definitions, **Then** fields are organized in a consistent order: id, business fields, timestamps, relations
3. **Given** the refactored schema, **When** I see a field with constraints, **Then** the constraint is clearly documented with its purpose

---

### Edge Cases

- What happens when a model has both a unique constraint and an index on the same field? (Remove redundant indexes)
- How are check constraints handled that were mentioned in comments but not defined? (Properly implement or remove comments)
- What if the `migrations` model is a custom table not managed by Prisma? (Document its purpose or remove if unnecessary)
- How are enum-like string fields (e.g., `discipline`, `role`) handled? (Consider using Prisma enums or document allowed values)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Schema MUST use PascalCase for all model names (e.g., `AuditLog` not `audit_logs`)
- **FR-002**: Schema MUST use camelCase for all field names (e.g., `tableName` not `table_name`)
- **FR-003**: Schema MUST organize models into logical groups with clear section comments
- **FR-004**: Schema MUST define all relationships between models using Prisma relation syntax
- **FR-005**: Schema MUST include documentation comments for each model explaining its purpose
- **FR-006**: Schema MUST organize fields within each model consistently: id fields, business fields, timestamp fields, relation fields
- **FR-007**: Schema MUST use consistent ID generation strategy across all models (prefer `@default(autoincrement())` for PostgreSQL)
- **FR-008**: Schema MUST use consistent naming for indexes following a clear pattern (e.g., `idx_ModelName_fieldName`)
- **FR-009**: Schema MUST remove or properly implement check constraints mentioned in comments
- **FR-010**: Schema MUST use consistent field type definitions (either use `@db.VarChar` consistently or use default String types where appropriate)
- **FR-011**: Schema MUST document the purpose of the `migrations` model if it's a custom table, or remove it if unnecessary
- **FR-012**: Schema MUST ensure all foreign key relationships use proper `onDelete` and `onUpdate` actions
- **FR-013**: Schema MUST maintain backward compatibility with existing database data during migration
- **FR-014**: Schema MUST preserve all existing indexes and constraints that are currently in use
- **FR-015**: Schema MUST ensure generated Prisma client types match the refactored naming conventions

### Key Entities *(include if feature involves data)*

- **AuditLog**: Tracks all changes to database records for compliance and debugging
- **CurrentState**: Represents the single current active sprint and role assignments (singleton pattern)
- **Sprint**: Represents a sprint schedule with start/end dates and index
- **Override**: Represents coverage override requests and approvals for sprint assignments
- **User**: Represents user information with Slack ID and discipline assignments
- **Discipline**: Represents discipline definitions per environment
- **Migration** (if retained): Custom migration tracking table (purpose to be clarified)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of model names follow PascalCase convention (0 snake_case model names)
- **SC-002**: 100% of field names follow camelCase convention (0 snake_case field names)
- **SC-003**: All models have documentation comments explaining their purpose
- **SC-004**: All relationships between models are properly defined using Prisma relation syntax
- **SC-005**: Schema file can be read and understood by a new developer in under 10 minutes
- **SC-006**: Generated Prisma client successfully compiles with no type errors after refactoring
- **SC-007**: All existing database queries continue to work after migration (0 breaking changes to application code)
- **SC-008**: Migration from old schema to new schema completes successfully without data loss
- **SC-009**: Schema follows Prisma best practices as documented in official Prisma documentation
- **SC-010**: All redundant or unnecessary indexes are removed, and all necessary indexes are preserved
