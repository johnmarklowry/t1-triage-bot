# Prisma Schema Refactoring Contract

**Date**: 2025-01-27  
**Feature**: Refactor Prisma Schema  
**Purpose**: Define the contract for Prisma schema refactoring and client generation

## Overview

This contract defines the expected behavior and structure of the refactored Prisma schema and generated Prisma client.

## Schema Structure Contract

### Naming Conventions

**Model Names**:
- MUST use PascalCase (e.g., `AuditLog`, `CurrentState`, `Sprint`)
- MUST map to existing database tables using `@@map` attribute
- Example: `model AuditLog { @@map("audit_logs") }`

**Field Names**:
- MUST use camelCase (e.g., `tableName`, `sprintIndex`, `createdAt`)
- MUST map to existing database columns using `@map` attribute
- Example: `tableName String @map("table_name")`

**Index Names**:
- MUST follow pattern: `idx_ModelName_fieldName` or `idx_ModelName_field1_field2`
- MUST use `map` attribute to preserve existing index names in database

### Model Organization

**Grouping**:
- Models MUST be organized into logical groups with section comments
- Groups: Core Business Entities, Workflow Models, System Models

**Field Ordering**:
- Within each model, fields MUST be ordered: id → business fields → timestamps → relations

### Relationship Definitions

**Explicit Relations**:
- All relationships MUST be explicitly defined using Prisma `@relation` syntax
- Foreign key fields MUST have corresponding relation fields
- `onDelete` and `onUpdate` actions MUST be specified

**Example**:
```prisma
model Sprint {
  id            Int            @id @default(autoincrement())
  currentStates CurrentState[]
}

model CurrentState {
  id          Int    @id @default(autoincrement())
  sprintIndex Int?
  sprint      Sprint? @relation(fields: [sprintIndex], references: [sprintIndex], onDelete: NoAction, onUpdate: NoAction)
}
```

## Prisma Client Contract

### Generated Types

**Model Types**:
- Generated client MUST expose models with PascalCase names
- Example: `prisma.auditLog` → `prisma.auditLog` (model name in code matches schema)

**Field Access**:
- Generated client MUST expose fields with camelCase names
- Example: `auditLog.tableName` (not `auditLog.table_name`)

**Type Safety**:
- Generated TypeScript types MUST match schema field types
- Relations MUST be properly typed for `include` and `select` operations

### Query Interface

**Model Access**:
```typescript
// Access models using PascalCase (converted to camelCase in client)
prisma.auditLog.findMany()
prisma.currentState.findUnique()
prisma.sprint.findMany()
```

**Field Selection**:
```typescript
// Use camelCase field names
prisma.auditLog.findMany({
  where: { tableName: 'users' },
  select: { id: true, tableName: true, changedAt: true }
})
```

**Relations**:
```typescript
// Use relation fields for includes
prisma.sprint.findUnique({
  where: { id: 1 },
  include: { currentStates: true }
})
```

## Migration Contract

### Schema Validation

**Prisma Validate**:
- `npx prisma validate` MUST pass without errors
- Schema MUST be syntactically correct
- All relations MUST be properly defined

### Client Generation

**Prisma Generate**:
- `npx prisma generate` MUST complete successfully
- Generated client MUST compile without TypeScript errors
- All model and field types MUST be correctly generated

### Database Compatibility

**No Database Changes**:
- Initial refactoring MUST NOT require database schema changes
- `@@map` and `@map` attributes MUST preserve existing table/column names
- Existing indexes and constraints MUST remain unchanged

**Migration Generation**:
- `npx prisma migrate dev --create-only` MUST generate empty migration (no SQL changes)
- If migration contains SQL, it MUST only be for new features, not renaming

## Backward Compatibility Contract

### Application Code

**Gradual Migration**:
- Existing code using old Prisma client MUST continue to work during transition
- New code SHOULD use new camelCase field names
- Old snake_case references MUST be updated to camelCase

**Breaking Changes**:
- Model access: `prisma.audit_logs` → `prisma.auditLog` (breaking)
- Field access: `record.table_name` → `record.tableName` (breaking)
- These breaking changes MUST be documented and code updated accordingly

### Database Schema

**No Breaking Changes**:
- Database table names MUST remain unchanged
- Database column names MUST remain unchanged
- Database indexes MUST remain unchanged
- All existing queries and constraints MUST continue to work

## Testing Contract

### Validation Steps

1. **Schema Validation**: `npx prisma validate` passes
2. **Client Generation**: `npx prisma generate` succeeds
3. **Type Checking**: Generated types compile without errors
4. **Migration Check**: No database changes required for initial refactoring
5. **Query Testing**: Sample queries work with new client types

### Acceptance Criteria

- ✅ All models use PascalCase names
- ✅ All fields use camelCase names
- ✅ All relationships are explicitly defined
- ✅ Generated client compiles without errors
- ✅ No database schema changes required
- ✅ Existing application code can be updated to use new types

