# Quickstart: Prisma Schema Refactoring

**Date**: 2025-01-27  
**Feature**: Refactor Prisma Schema  
**Purpose**: Step-by-step guide for refactoring and migrating the Prisma schema

## Prerequisites

- Node.js >=18.0.0
- PostgreSQL database with existing schema
- Prisma CLI installed (`npm install -g prisma` or via `npx`)
- Access to database via `DATABASE_URL` environment variable

## Overview

This refactoring will:
1. Rename all models to PascalCase
2. Rename all fields to camelCase
3. Organize models into logical groups
4. Add comprehensive documentation
5. Ensure all relationships are properly defined
6. Maintain backward compatibility with existing database

## Step-by-Step Process

### Step 1: Backup Current Schema

```bash
# Create a backup of the current schema
cp prisma/schema.prisma prisma/schema.prisma.backup

# Create a backup of the database (recommended)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Refactor Schema File

1. Open `prisma/schema.prisma`
2. Apply the following changes:
   - Rename all models to PascalCase
   - Rename all fields to camelCase
   - Add `@@map` attributes to models mapping to existing table names
   - Add `@map` attributes to fields mapping to existing column names
   - Organize models into logical groups with section comments
   - Add documentation comments to each model
   - Ensure all relationships are explicitly defined
   - Update index names to follow consistent pattern

### Step 3: Validate Schema

```bash
# Validate the schema syntax
npx prisma validate

# Format the schema (optional but recommended)
npx prisma format
```

**Expected Result**: Schema validation passes without errors.

### Step 4: Check Migration Impact

```bash
# Create a migration in create-only mode to see what would change
npx prisma migrate dev --create-only --name refactor_schema_naming

# Review the generated migration file
# It should be empty or only contain new features, not renames
```

**Expected Result**: Migration file should be empty or minimal (no table/column renames).

### Step 5: Generate Prisma Client

```bash
# Generate the Prisma client with new types
npx prisma generate
```

**Expected Result**: Client generates successfully with new PascalCase model names and camelCase field names.

### Step 6: Verify Generated Types

```bash
# Check if TypeScript types are correct (if using TypeScript)
npx tsc --noEmit

# Or test in Node.js REPL
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); console.log('Client loaded successfully');"
```

**Expected Result**: No type errors, client loads successfully.

### Step 7: Test Database Queries

Create a test script to verify queries work:

```javascript
// test-refactored-schema.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testQueries() {
  try {
    // Test model access with new names
    const auditLogs = await prisma.auditLog.findMany({ take: 1 });
    console.log('✅ AuditLog query works');
    
    const sprints = await prisma.sprint.findMany({ take: 1 });
    console.log('✅ Sprint query works');
    
    const currentState = await prisma.currentState.findUnique({ where: { id: 1 } });
    console.log('✅ CurrentState query works');
    
    // Test field access with camelCase
    if (auditLogs.length > 0) {
      console.log('✅ Field access works:', auditLogs[0].tableName);
    }
    
    // Test relations
    const sprintWithState = await prisma.sprint.findUnique({
      where: { id: 1 },
      include: { currentStates: true }
    });
    console.log('✅ Relations work');
    
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testQueries();
```

Run the test:
```bash
node test-refactored-schema.js
```

**Expected Result**: All queries execute successfully.

### Step 8: Update Application Code

Update all files that use Prisma client to use new naming:

**Find files using Prisma**:
```bash
# Find files that import or use Prisma
grep -r "prisma\." --include="*.js" --include="*.ts" .
grep -r "@prisma/client" --include="*.js" --include="*.ts" .
```

**Update model references**:
- `prisma.audit_logs` → `prisma.auditLog`
- `prisma.current_state` → `prisma.currentState`
- `prisma.sprints` → `prisma.sprint`
- `prisma.overrides` → `prisma.override`
- `prisma.users` → `prisma.user`
- `prisma.discipline` → `prisma.discipline` (unchanged)
- `prisma.migrations` → `prisma.migration`

**Update field references**:
- `record.table_name` → `record.tableName`
- `record.sprint_index` → `record.sprintIndex`
- `record.created_at` → `record.createdAt`
- `record.updated_at` → `record.updatedAt`
- etc.

**Example migration**:
```javascript
// Before
const logs = await prisma.audit_logs.findMany({
  where: { table_name: 'users' },
  select: { id: true, table_name: true, changed_at: true }
});

// After
const logs = await prisma.auditLog.findMany({
  where: { tableName: 'users' },
  select: { id: true, tableName: true, changedAt: true }
});
```

### Step 9: Run Application Tests

```bash
# Run any existing tests
npm test

# Or manually test critical functionality
# - Test Slack bot commands
# - Test database operations
# - Test migration scripts
```

**Expected Result**: All tests pass, application functions correctly.

### Step 10: Apply Migration (if needed)

If the migration file from Step 4 contains any changes:

```bash
# Apply the migration
npx prisma migrate deploy

# Or in development
npx prisma migrate dev
```

**Note**: For the initial refactoring, this should be a no-op since we're using `@@map` and `@map` to preserve database names.

## Verification Checklist

- [ ] Schema validates: `npx prisma validate` passes
- [ ] Client generates: `npx prisma generate` succeeds
- [ ] No database changes: Migration is empty or minimal
- [ ] Types are correct: No TypeScript/compilation errors
- [ ] Queries work: Test script passes
- [ ] Application code updated: All Prisma references use new names
- [ ] Application tests pass: All functionality works
- [ ] Documentation updated: Schema comments are clear

## Rollback Plan

If issues are encountered:

1. **Restore schema file**:
   ```bash
   cp prisma/schema.prisma.backup prisma/schema.prisma
   ```

2. **Regenerate client**:
   ```bash
   npx prisma generate
   ```

3. **Revert code changes** (if committed):
   ```bash
   git checkout -- .
   ```

4. **Restore database** (if migration was applied):
   ```bash
   # Restore from backup
   psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
   ```

## Common Issues and Solutions

### Issue: "Model X does not exist"
**Solution**: Check that model name is correctly mapped with `@@map` attribute.

### Issue: "Field Y does not exist"
**Solution**: Check that field name is correctly mapped with `@map` attribute.

### Issue: "Relation is missing"
**Solution**: Ensure both sides of the relation are defined with `@relation` attribute.

### Issue: "Migration contains unexpected SQL"
**Solution**: Review migration file. If it contains renames, check that `@@map` and `@map` attributes are correctly applied.

### Issue: "Type errors in generated client"
**Solution**: Run `npx prisma generate` again. If persists, check schema syntax with `npx prisma validate`.

## Next Steps

After successful refactoring:

1. Update all application code to use new naming conventions
2. Update documentation to reflect new schema structure
3. Consider future migration to rename database tables/columns (optional)
4. Add schema validation to CI/CD pipeline
5. Document the new naming conventions for team members

## Additional Resources

- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Prisma Migrate Guide](https://www.prisma.io/docs/guides/migrate)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)

