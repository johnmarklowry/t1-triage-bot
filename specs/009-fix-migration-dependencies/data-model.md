# Data Model: Migration Dependency Validation

## Entities

### MigrationFile
Represents a single migration SQL file.

**Attributes**:
- `filename` (string): Name of the migration file (e.g., "004_create_notification_snapshots.sql")
- `content` (string): Full SQL content of the migration file
- `statements` (array of Statement): Parsed SQL statements in original order
- `reorderedStatements` (array of Statement): SQL statements reordered to satisfy dependencies

**Relationships**:
- Contains multiple `Statement` entities
- Has dependencies on other `MigrationFile` entities (via table references)

### Statement
Represents a single SQL statement within a migration file.

**Attributes**:
- `sql` (string): The SQL statement text
- `type` (enum): Type of statement - "CREATE_TABLE", "ALTER_TABLE", "CREATE_INDEX", "CREATE_FUNCTION", "DO_BLOCK", "OTHER"
- `tableName` (string, optional): Name of the table this statement operates on (if applicable)
- `dependencies` (array of string): List of table names this statement depends on (for foreign keys)
- `originalIndex` (number): Original position in the migration file (for reordering)

**Relationships**:
- Belongs to a `MigrationFile`
- May depend on other `Statement` entities (via table dependencies)

### TableDependency
Represents a dependency relationship between tables.

**Attributes**:
- `dependentTable` (string): Name of the table that has the dependency
- `referencedTable` (string): Name of the table being referenced
- `dependencyType` (enum): Type of dependency - "FOREIGN_KEY", "INHERITS", "OTHER"
- `statementIndex` (number): Index of the statement that creates this dependency

**Relationships**:
- Links two table names (dependent → referenced)

### DependencyGraph
Represents the complete dependency graph for a migration or set of migrations.

**Attributes**:
- `nodes` (array of string): All table names (nodes in the graph)
- `edges` (array of TableDependency): All dependency relationships (edges in the graph)
- `executedTables` (array of string): Tables that already exist in the database (from previous migrations)

**Relationships**:
- Contains multiple `TableDependency` entities
- Represents dependencies across one or more `MigrationFile` entities

## Validation Rules

### Statement Parsing
- SQL statements must be correctly identified and categorized
- Table names must be extracted accurately from `CREATE TABLE` statements
- Foreign key references must be detected in both inline (`REFERENCES`) and separate constraint (`ALTER TABLE ... ADD CONSTRAINT`) forms
- Dollar-quoted strings (e.g., `$$ ... $$`) must be preserved and not parsed as regular SQL

### Dependency Validation
- All referenced tables must either:
  - Be created in the same migration file (earlier in the file)
  - Already exist in the database (from previous migrations)
- Circular dependencies within a single migration must be detected and reported as errors
- Missing dependencies must be reported with clear error messages

### Statement Reordering
- Statements must maintain their relative order when no dependencies exist
- Table creation statements must be reordered to satisfy dependencies
- Non-table statements (indexes, functions, triggers) must maintain their position relative to their associated table
- DO blocks and function definitions must not be reordered (preserved as-is)

## State Transitions

### Migration Validation Flow

1. **Parse Migration File**
   - Input: Migration file content (string)
   - Process: Split into statements, identify types, extract table names and dependencies
   - Output: `MigrationFile` entity with parsed statements

2. **Build Dependency Graph**
   - Input: Parsed statements from current and previous migrations
   - Process: Extract table dependencies, check which tables exist in database
   - Output: `DependencyGraph` entity

3. **Validate Dependencies**
   - Input: Dependency graph
   - Process: Check all referenced tables exist (in migration or database)
   - Output: Validation result (success or error with details)

4. **Reorder Statements** (if validation passes)
   - Input: Parsed statements and dependency graph
   - Process: Reorder statements to satisfy dependencies
   - Output: Reordered statements array

5. **Execute Migration**
   - Input: Reordered statements
   - Process: Execute statements in order within transaction
   - Output: Migration execution result

## Constraints

- Migration files must be valid SQL
- Table names must be unique within a migration (or use `IF NOT EXISTS`)
- Foreign key references must reference valid table names
- Statement reordering must not break SQL syntax or logic
- All statements in a migration must execute within a single transaction

