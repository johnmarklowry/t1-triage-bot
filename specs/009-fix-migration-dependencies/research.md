# Research: Migration Dependency Validation

## Problem Analysis

The current migration system executes SQL statements sequentially within a transaction. When a migration creates multiple tables with foreign key relationships, PostgreSQL validates foreign key constraints immediately upon table creation. If the referenced table hasn't been created yet (or hasn't been committed in the transaction), the foreign key constraint creation fails.

**Root Cause**: Migration 004 creates `cron_trigger_audits` and `notification_snapshots` in the same file, with `notification_snapshots` having a foreign key reference to `cron_trigger_audits`. Even though `cron_trigger_audits` is created first, PostgreSQL validates the foreign key constraint when `notification_snapshots` is created, and if there's any timing issue or the table creation hasn't been fully processed, the constraint fails.

## Solution Approaches Evaluated

### Option 1: Defer Foreign Key Constraint Creation
**Approach**: Create tables first, then add foreign key constraints in a separate statement after all tables exist.

**Pros**:
- Simple to implement
- Works reliably with PostgreSQL
- No need to parse or reorder SQL

**Cons**:
- Requires modifying migration files (breaking change)
- Doesn't solve the problem for existing migrations
- Requires developers to remember this pattern

**Decision**: ❌ Rejected - Requires modifying existing migrations and doesn't prevent future errors

### Option 2: SQL Statement Reordering
**Approach**: Parse SQL migrations to detect dependencies, reorder statements so referenced tables are created before tables that reference them.

**Pros**:
- Works with existing migrations without modification
- Prevents future dependency errors automatically
- Transparent to developers

**Cons**:
- More complex to implement (requires SQL parsing)
- Must handle edge cases (conditional creation, functions, triggers)
- Performance overhead for parsing

**Decision**: ✅ Selected - Best long-term solution that prevents errors proactively

### Option 3: Two-Phase Table Creation
**Approach**: Split migration execution into two phases: create all tables first, then add constraints.

**Pros**:
- Reliable execution order
- Works with existing migrations

**Cons**:
- Complex to implement (requires sophisticated SQL parsing)
- May break migrations that depend on constraints existing immediately
- Harder to validate correctness

**Decision**: ❌ Rejected - Too complex and may break existing migration assumptions

## Technical Implementation Details

### SQL Parsing Strategy

**Decision**: Use regex-based parsing to detect:
1. `CREATE TABLE` statements to identify table creation
2. `REFERENCES` clauses to identify foreign key dependencies
3. `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` to identify constraint additions

**Rationale**: 
- Regex parsing is sufficient for detecting table dependencies
- Full SQL parsing (AST) would be overkill and add unnecessary complexity
- PostgreSQL migration files follow predictable patterns

**Alternatives Considered**:
- Full SQL parser (pg-query-parser, node-sql-parser): Too heavy, may not support all PostgreSQL syntax
- Simple string matching: Too fragile, misses edge cases
- Regex with validation: Good balance of simplicity and reliability

### Dependency Detection Algorithm

**Decision**: Build a dependency graph by:
1. Scanning all `CREATE TABLE` statements to build a list of tables being created
2. Scanning all `REFERENCES` clauses to build dependency edges (table → referenced_table)
3. Validating that all referenced tables either:
   - Are created in the same migration (earlier in the file)
   - Already exist in the database (from previous migrations)

**Rationale**: 
- Graph-based approach is standard for dependency resolution
- Validates both intra-migration and inter-migration dependencies
- Clear error messages when dependencies are missing

### Statement Reordering Strategy

**Decision**: Reorder statements within a migration file to ensure:
1. All `CREATE TABLE` statements for referenced tables come before tables that reference them
2. Foreign key constraints are added after all referenced tables are created
3. Indexes and other statements maintain their relative order to their table

**Rationale**:
- Minimal reordering reduces risk of breaking migration logic
- Only reorders when necessary (when dependencies are detected)
- Preserves original order when no dependencies exist

**Edge Cases Handled**:
- `CREATE TABLE IF NOT EXISTS`: Treated as table creation, but validation checks if table already exists
- Conditional logic in DO blocks: Preserved as-is, not reordered
- Functions and triggers: Preserved in original order relative to their tables

### Error Reporting

**Decision**: Provide detailed error messages that include:
- Migration file name
- Statement that failed
- Missing table/constraint name
- Suggested fix (e.g., "Table 'cron_trigger_audits' must be created before 'notification_snapshots'")

**Rationale**:
- Clear error messages reduce troubleshooting time
- Actionable suggestions help developers fix issues quickly
- Matches success criteria requirement for 100% clear error identification

## PostgreSQL-Specific Considerations

### Foreign Key Constraint Validation Timing

**Finding**: PostgreSQL validates foreign key constraints at different times depending on how they're created:
- Inline `REFERENCES` in `CREATE TABLE`: Validated immediately
- `ALTER TABLE ... ADD CONSTRAINT`: Validated when constraint is added

**Implication**: We can defer constraint creation by separating table creation from constraint addition, but this requires detecting and splitting these statements.

**Decision**: For now, focus on ensuring referenced tables exist before creating tables with inline foreign keys. Future enhancement could split constraint creation, but that's out of scope.

### Transaction Behavior

**Finding**: Within a transaction, all table creations are visible to subsequent statements, but PostgreSQL still validates foreign key constraints immediately.

**Implication**: Statement order matters even within a transaction. Reordering is necessary.

**Decision**: Reorder statements before execution, ensuring referenced tables are created first.

## Performance Considerations

**Target**: <10% overhead on migration execution time

**Analysis**:
- SQL parsing: ~1-5ms per migration file (negligible)
- Dependency graph building: ~1-2ms per migration (negligible)
- Statement reordering: ~0.5ms per migration (negligible)
- Validation queries: 1 query per referenced table to check existence (~10-50ms total)

**Expected Overhead**: ~20-60ms per migration, which is <1% of typical migration execution time (1-5 seconds). Well within 10% target.

**Decision**: Performance overhead is acceptable. No optimization needed.

## Testing Strategy

**Decision**: Test with:
1. Existing migrations (001-004) to ensure no regressions
2. Test migration files with various dependency scenarios:
   - Simple forward reference (table A references table B, B created first)
   - Reverse reference (table A references table B, A created first - should reorder)
   - Circular reference (should error)
   - Conditional creation (`IF NOT EXISTS`)
   - Multiple tables with complex dependencies

**Rationale**: 
- Ensures backward compatibility
- Validates all edge cases from requirements
- Provides confidence in the solution

## Implementation Phases

1. **Phase 1**: Add SQL parsing to detect table dependencies
2. **Phase 2**: Add dependency validation (check referenced tables exist)
3. **Phase 3**: Add statement reordering within migrations
4. **Phase 4**: Add comprehensive error reporting
5. **Phase 5**: Test with all existing migrations

**Rationale**: Incremental implementation allows testing at each stage and reduces risk.

