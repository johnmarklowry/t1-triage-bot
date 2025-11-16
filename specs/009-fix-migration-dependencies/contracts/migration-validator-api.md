# Migration Validator API Contract

## Overview

The migration validator provides functions to parse SQL migrations, detect table dependencies, validate dependencies, and reorder statements to ensure correct execution order.

## Module: `db/migrationValidator.js`

### Function: `parseMigrationFile(filename, content)`

Parses a migration file into structured statement objects.

**Parameters**:
- `filename` (string): Name of the migration file
- `content` (string): SQL content of the migration file

**Returns**: `MigrationFile` object with:
- `filename`: Original filename
- `statements`: Array of `Statement` objects in original order
- `tablesCreated`: Array of table names being created
- `dependencies`: Array of `TableDependency` objects

**Throws**: 
- `SyntaxError` if SQL cannot be parsed (unclosed quotes, invalid syntax)

**Example**:
```javascript
const migration = parseMigrationFile(
  '004_create_notification_snapshots.sql',
  'CREATE TABLE cron_trigger_audits (...); CREATE TABLE notification_snapshots (... REFERENCES cron_trigger_audits(id));'
);
// Returns: { filename: '...', statements: [...], tablesCreated: ['cron_trigger_audits', 'notification_snapshots'], dependencies: [...] }
```

---

### Function: `detectDependencies(statements)`

Detects table dependencies from parsed SQL statements.

**Parameters**:
- `statements` (array of Statement): Parsed SQL statements

**Returns**: Array of `TableDependency` objects, each with:
- `dependentTable`: Table that has the dependency
- `referencedTable`: Table being referenced
- `dependencyType`: Type of dependency (e.g., "FOREIGN_KEY")
- `statementIndex`: Index of the statement creating this dependency

**Example**:
```javascript
const deps = detectDependencies(statements);
// Returns: [{ dependentTable: 'notification_snapshots', referencedTable: 'cron_trigger_audits', dependencyType: 'FOREIGN_KEY', statementIndex: 1 }]
```

---

### Function: `validateDependencies(migrationFile, executedTables)`

Validates that all table dependencies can be satisfied.

**Parameters**:
- `migrationFile` (MigrationFile): Parsed migration file
- `executedTables` (array of string): Tables that already exist in the database (from previous migrations)

**Returns**: `ValidationResult` object with:
- `valid` (boolean): Whether all dependencies are satisfied
- `errors` (array of string): Error messages for missing dependencies (empty if valid)
- `warnings` (array of string): Warning messages (e.g., potential issues)

**Throws**: None (returns validation result instead)

**Example**:
```javascript
const result = validateDependencies(migrationFile, ['users', 'sprints']);
if (!result.valid) {
  console.error('Validation failed:', result.errors);
}
// Returns: { valid: true, errors: [], warnings: [] }
// or: { valid: false, errors: ['Table "cron_trigger_audits" referenced by "notification_snapshots" does not exist'], warnings: [] }
```

---

### Function: `reorderStatements(statements, dependencies)`

Reorders SQL statements to satisfy table dependencies.

**Parameters**:
- `statements` (array of Statement): Original statements in file order
- `dependencies` (array of TableDependency): Dependency relationships

**Returns**: Array of `Statement` objects in reordered sequence

**Behavior**:
- Preserves original order when no dependencies exist
- Reorders table creation statements so referenced tables are created first
- Preserves relative order of non-table statements (indexes, functions) relative to their tables
- Does not reorder DO blocks or function definitions

**Example**:
```javascript
const reordered = reorderStatements(statements, dependencies);
// Returns: Statements array with table creations reordered to satisfy dependencies
```

---

### Function: `buildDependencyGraph(migrationFiles, executedTables)`

Builds a complete dependency graph across multiple migration files.

**Parameters**:
- `migrationFiles` (array of MigrationFile): All migration files to analyze
- `executedTables` (array of string): Tables already in the database

**Returns**: `DependencyGraph` object with:
- `nodes`: All table names
- `edges`: All dependency relationships
- `executedTables`: Tables that already exist

**Example**:
```javascript
const graph = buildDependencyGraph([migration1, migration2, migration3], ['users']);
// Returns: Dependency graph covering all migrations
```

---

## Integration with `db/migrate.js`

### Enhanced Function: `executeMigration(filename)`

**Changes**:
1. Before executing statements, parse the migration file
2. Detect dependencies and validate them
3. If validation fails, throw error with clear message
4. If validation passes, reorder statements
5. Execute reordered statements instead of original order

**Error Handling**:
- Validation errors: Throw with message identifying missing table and migration file
- Parsing errors: Throw with message identifying syntax issue and location
- Execution errors: Existing error handling (transaction rollback)

**Example Error Message**:
```
Migration dependency error in 004_create_notification_snapshots.sql:
  Table "cron_trigger_audits" must be created before "notification_snapshots"
  Statement 2 references table that doesn't exist yet
```

---

## Error Types

### `MigrationValidationError`
Thrown when dependency validation fails.

**Properties**:
- `message`: Human-readable error message
- `migrationFile`: Name of the migration file with the error
- `missingTable`: Name of the missing table
- `dependentTable`: Name of the table that depends on it
- `statementIndex`: Index of the statement causing the error

### `MigrationParseError`
Thrown when SQL parsing fails.

**Properties**:
- `message`: Human-readable error message
- `migrationFile`: Name of the migration file with the error
- `line`: Line number where parsing failed (if available)
- `syntax`: The problematic SQL syntax

