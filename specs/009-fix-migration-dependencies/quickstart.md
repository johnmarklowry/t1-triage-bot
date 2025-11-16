# Quickstart: Migration Dependency Validation

## Overview

The migration dependency validation system automatically detects and fixes table dependency issues in database migrations. It ensures that tables referenced by foreign keys are created before the tables that reference them.

## How It Works

1. **Automatic**: When migrations run, the system automatically:
   - Parses each migration file to detect table dependencies
   - Validates that all referenced tables exist (from previous migrations or in the same file)
   - Reorders statements within migrations to satisfy dependencies
   - Executes migrations with the correct statement order

2. **Transparent**: No changes required to existing migration files. The system works with your current migrations automatically.

3. **Error Prevention**: If a dependency cannot be satisfied, the system reports a clear error before attempting to execute the migration.

## Testing the Feature

### Test 1: Verify Existing Migrations Work

Run migrations on a fresh database:

```bash
# Connect to a test database
npm run migrate

# Expected: All migrations execute successfully
# Output: [MIGRATION] Executing 001_initial_schema.sql...
#         [MIGRATION] Executing 002_fix_duplicate_key_constraints.sql...
#         [MIGRATION] Executing 003_add_pending_to_cron_audit_result.sql...
#         [MIGRATION] Executing 004_create_notification_snapshots.sql...
#         [MIGRATION] All migrations completed successfully
```

### Test 2: Verify Dependency Detection

Create a test migration with a dependency issue:

```sql
-- test_migration.sql
CREATE TABLE dependent_table (
  id SERIAL PRIMARY KEY,
  ref_id INTEGER REFERENCES missing_table(id)
);
```

Run the migration:

```bash
npm run migrate

# Expected: Validation error before execution
# Output: Migration dependency error in test_migration.sql:
#         Table "missing_table" must be created before "dependent_table"
#         Statement 1 references table that doesn't exist
```

### Test 3: Verify Statement Reordering

Create a test migration where tables are created in the wrong order:

```sql
-- test_reorder.sql
CREATE TABLE child_table (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES parent_table(id)
);

CREATE TABLE parent_table (
  id SERIAL PRIMARY KEY
);
```

Run the migration:

```bash
npm run migrate

# Expected: Statements are automatically reordered and executed successfully
# Output: [MIGRATION] Executing test_reorder.sql...
#         [MIGRATION] Reordered 2 statements to satisfy dependencies
#         [MIGRATION] Completed test_reorder.sql
```

### Test 4: Verify Error Messages

Intentionally create a migration with a missing dependency:

```sql
-- test_error.sql
CREATE TABLE users_new (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES roles(id)
);
-- Note: 'roles' table doesn't exist and isn't created in this migration
```

Run the migration:

```bash
npm run migrate

# Expected: Clear error message identifying the issue
# Output: Migration dependency error in test_error.sql:
#         Table "roles" referenced by "users_new" does not exist
#         - Referenced table "roles" is not created in this migration
#         - Referenced table "roles" does not exist in database
#         Suggestion: Create "roles" table before "users_new" or in a previous migration
```

## Manual Testing via Test Routes

Add a test route to manually trigger migration validation:

```javascript
// In testRoutes.js or similar
app.get('/test/migration-validation', async (req, res) => {
  const { validateMigration } = require('./db/migrationValidator');
  const { getExecutedMigrations } = require('./db/migrate');
  
  const executed = await getExecutedMigrations();
  const result = await validateMigration('004_create_notification_snapshots.sql', executed);
  
  res.json({
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings
  });
});
```

Test the route:

```bash
curl http://localhost:3000/test/migration-validation

# Expected: JSON response with validation results
# {
#   "valid": true,
#   "errors": [],
#   "warnings": []
# }
```

## Verifying the Fix

### Before the Fix

Migration 004 would fail with:
```
error: relation "cron_trigger_audits" does not exist
```

### After the Fix

Migration 004 executes successfully:
- System detects that `notification_snapshots` depends on `cron_trigger_audits`
- Validates that `cron_trigger_audits` is created earlier in the same migration
- Executes statements in correct order
- Migration completes successfully

## Troubleshooting

### Issue: Migration still fails with dependency error

**Check**:
1. Is the referenced table created in a previous migration? Verify with `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`
2. Is the table name spelled correctly in the foreign key reference?
3. Does the migration file have syntax errors that prevent parsing?

**Solution**: Review the error message - it will identify the specific missing table and migration file.

### Issue: Statements are reordered incorrectly

**Check**:
1. Are there any DO blocks or functions that depend on statement order?
2. Are indexes created in the correct order relative to their tables?

**Solution**: Review the migration file structure. The system preserves relative order of non-table statements, but complex logic in DO blocks may need manual adjustment.

### Issue: Performance seems slower

**Check**:
1. How many migrations are being validated?
2. How many dependencies are being checked?

**Solution**: Validation overhead should be <10% of migration execution time. If slower, check database connection performance.

## Next Steps

After implementing this feature:

1. **Test with all existing migrations** to ensure no regressions
2. **Monitor production deployments** to verify migrations execute successfully
3. **Update migration documentation** to explain the automatic dependency handling
4. **Consider adding migration validation to CI/CD** to catch dependency issues before deployment

