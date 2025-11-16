# Tasks: Prevent Migration Dependency Errors

**Input**: Design documents from `/specs/009-fix-migration-dependencies/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Manual testing via test routes and integration testing with test database (per quickstart.md)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project structure verification and preparation

- [x] T001 Verify existing migration system structure in db/migrate.js
- [x] T002 Verify database connection module in db/connection.js supports required operations
- [x] T003 [P] Review existing migration files in db/migrations/ to understand current patterns

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create new module db/migrationValidator.js with module structure and exports
- [x] T005 [P] Define Statement entity structure (type, sql, tableName, dependencies, originalIndex) in db/migrationValidator.js
- [x] T006 [P] Define MigrationFile entity structure (filename, statements, tablesCreated, dependencies) in db/migrationValidator.js
- [x] T007 [P] Define TableDependency entity structure (dependentTable, referencedTable, dependencyType, statementIndex) in db/migrationValidator.js
- [x] T008 [P] Define DependencyGraph entity structure (nodes, edges, executedTables) in db/migrationValidator.js
- [x] T009 [P] Define MigrationValidationError class in db/migrationValidator.js
- [x] T010 [P] Define MigrationParseError class in db/migrationValidator.js

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Successful Migration Execution (Priority: P1) 🎯 MVP

**Goal**: Migrations execute successfully without dependency errors, ensuring application can start correctly and database schema is properly initialized.

**Independent Test**: Run migrations on a fresh database and verify all tables are created correctly with proper foreign key relationships. Test with existing migrations 001-004.

### Implementation for User Story 1

- [x] T011 [US1] Implement parseMigrationFile function in db/migrationValidator.js to parse SQL content into Statement objects
- [x] T012 [US1] Add regex-based detection of CREATE TABLE statements in parseMigrationFile function in db/migrationValidator.js
- [x] T013 [US1] Add regex-based detection of REFERENCES clauses (inline foreign keys) in parseMigrationFile function in db/migrationValidator.js
- [x] T014 [US1] Add regex-based detection of ALTER TABLE ADD CONSTRAINT FOREIGN KEY statements in parseMigrationFile function in db/migrationValidator.js
- [x] T015 [US1] Add handling for dollar-quoted strings ($$ ... $$) in SQL parsing to preserve DO blocks in db/migrationValidator.js
- [x] T016 [US1] Implement detectDependencies function in db/migrationValidator.js to extract table dependencies from parsed statements
- [x] T017 [US1] Implement validateDependencies function in db/migrationValidator.js to check referenced tables exist
- [x] T018 [US1] Add database query to check if referenced tables exist in validateDependencies function in db/migrationValidator.js
- [x] T019 [US1] Implement reorderStatements function in db/migrationValidator.js to reorder table creation statements
- [x] T020 [US1] Add logic to preserve relative order of non-table statements (indexes, functions) in reorderStatements function in db/migrationValidator.js
- [x] T021 [US1] Add logic to preserve DO blocks and function definitions without reordering in reorderStatements function in db/migrationValidator.js
- [x] T022 [US1] Integrate parseMigrationFile into executeMigration function in db/migrate.js before statement execution
- [x] T023 [US1] Integrate validateDependencies into executeMigration function in db/migrate.js to validate before execution
- [x] T024 [US1] Integrate reorderStatements into executeMigration function in db/migrate.js to use reordered statements
- [x] T025 [US1] Update executeMigration function in db/migrate.js to execute reordered statements instead of original order
- [ ] T026 [US1] Test migration 004_create_notification_snapshots.sql executes successfully with dependency validation

**Checkpoint**: At this point, User Story 1 should be fully functional - migrations execute successfully with automatic dependency handling

---

## Phase 4: User Story 2 - Migration Dependency Validation (Priority: P1)

**Goal**: System validates migration dependencies before execution, catching dependency errors during development rather than in production.

**Independent Test**: Create a test migration with invalid dependencies and verify the system detects and reports the issue before execution.

### Implementation for User Story 2

- [x] T027 [US2] Enhance validateDependencies function in db/migrationValidator.js to check dependencies across multiple migration files
- [x] T028 [US2] Implement buildDependencyGraph function in db/migrationValidator.js to build complete dependency graph across migrations
- [x] T029 [US2] Add validation in executeMigration function in db/migrate.js to check dependencies before executing any statements
- [x] T030 [US2] Add check for circular dependencies within a single migration in validateDependencies function in db/migrationValidator.js
- [x] T031 [US2] Add check for tables referenced in later migrations (forward dependency violation) in validateDependencies function in db/migrationValidator.js
- [x] T032 [US2] Update runMigrations function in db/migrate.js to validate all pending migrations before executing any
- [ ] T033 [US2] Test validation detects missing table reference in test migration file
- [ ] T034 [US2] Test validation detects forward dependency violation (table referenced in later migration)

**Checkpoint**: At this point, User Story 2 should be fully functional - dependency validation prevents errors before execution

---

## Phase 5: User Story 3 - Clear Error Reporting (Priority: P2)

**Goal**: Clear error messages identify specific dependency issues, enabling quick troubleshooting and resolution.

**Independent Test**: Create a migration with dependency errors and verify the error message clearly identifies the missing table or constraint.

### Implementation for User Story 3

- [x] T035 [US3] Enhance MigrationValidationError to include migrationFile, missingTable, dependentTable, and statementIndex properties in db/migrationValidator.js
- [x] T036 [US3] Enhance MigrationParseError to include migrationFile, line, and syntax properties in db/migrationValidator.js
- [x] T037 [US3] Update validateDependencies function in db/migrationValidator.js to return detailed error messages with table names and migration file
- [x] T038 [US3] Add error message formatting in validateDependencies function in db/migrationValidator.js to identify both referencing and referenced tables
- [x] T039 [US3] Add error message formatting in validateDependencies function in db/migrationValidator.js to report all dependency issues together when multiple exist
- [x] T040 [US3] Add suggested fix messages in error reporting (e.g., "Create table X before table Y") in db/migrationValidator.js
- [x] T041 [US3] Update executeMigration function in db/migrate.js to throw MigrationValidationError with clear message when validation fails
- [x] T042 [US3] Update executeMigration function in db/migrate.js to throw MigrationParseError with clear message when parsing fails
- [ ] T043 [US3] Test error message clearly identifies missing table and migration file
- [ ] T044 [US3] Test error message identifies both referencing and referenced tables for foreign key issues
- [ ] T045 [US3] Test error message reports all issues when multiple dependency problems exist

**Checkpoint**: At this point, User Story 3 should be fully functional - error messages are clear and actionable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Testing, edge cases, and documentation

- [x] T046 [P] Add JSDoc comments to all functions in db/migrationValidator.js
- [x] T047 [P] Add inline comments for complex SQL parsing logic in db/migrationValidator.js
- [ ] T048 Test migration 001_initial_schema.sql executes successfully (backward compatibility)
- [ ] T049 Test migration 002_fix_duplicate_key_constraints.sql executes successfully (backward compatibility)
- [ ] T050 Test migration 003_add_pending_to_cron_audit_result.sql executes successfully (backward compatibility)
- [ ] T051 Test migration with CREATE TABLE IF NOT EXISTS conditional creation in db/migrationValidator.js
- [ ] T052 Test migration with DO blocks preserves original order in reorderStatements function in db/migrationValidator.js
- [ ] T053 Test migration with functions and triggers preserves relative order in reorderStatements function in db/migrationValidator.js
- [ ] T054 Test migration with multiple tables and complex dependencies reorders correctly in db/migrationValidator.js
- [ ] T055 Test migration with no dependencies maintains original order in reorderStatements function in db/migrationValidator.js
- [x] T056 Add test route /test/migration-validation in testRoutes.js for manual validation testing
- [ ] T057 Verify migration execution time overhead is <10% (performance validation)
- [ ] T058 Run quickstart.md validation tests to verify all test scenarios pass
- [x] T059 Update DATABASE_SETUP.md documentation to explain automatic dependency handling

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion - MVP, blocks User Story 2
- **User Story 2 (Phase 4)**: Depends on User Story 1 completion (builds on validation infrastructure)
- **User Story 3 (Phase 5)**: Depends on User Story 2 completion (enhances error reporting)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories. This is the MVP.
- **User Story 2 (P1)**: Depends on User Story 1 - Builds on the validation infrastructure from US1
- **User Story 3 (P2)**: Depends on User Story 2 - Enhances error reporting from US2

### Within Each User Story

- Parsing functions before validation functions
- Validation functions before reordering functions
- Core functions before integration with migrate.js
- Integration before testing
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks can run in parallel (T001-T003)
- All Foundational entity/structure definitions can run in parallel (T005-T010)
- SQL parsing regex patterns can be developed in parallel (T012-T014)
- Error class definitions can be created in parallel (T009-T010)
- Polish documentation tasks can run in parallel (T046-T047)
- Backward compatibility tests can run in parallel (T048-T050)
- Edge case tests can run in parallel (T051-T055)

---

## Parallel Example: User Story 1

```bash
# Launch all SQL parsing regex patterns together:
Task: "Add regex-based detection of CREATE TABLE statements in parseMigrationFile function in db/migrationValidator.js"
Task: "Add regex-based detection of REFERENCES clauses (inline foreign keys) in parseMigrationFile function in db/migrationValidator.js"
Task: "Add regex-based detection of ALTER TABLE ADD CONSTRAINT FOREIGN KEY statements in parseMigrationFile function in db/migrationValidator.js"

# Launch error class definitions together:
Task: "Define MigrationValidationError class in db/migrationValidator.js"
Task: "Define MigrationParseError class in db/migrationValidator.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently with existing migrations
5. Deploy/demo if ready - this fixes the immediate production issue

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP - fixes production issue!)
3. Add User Story 2 → Test independently → Deploy/Demo (enhanced validation)
4. Add User Story 3 → Test independently → Deploy/Demo (better error messages)
5. Add Polish → Final testing and documentation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (core functionality)
   - Developer B: Can work on error classes and documentation (T009, T010, T046, T047)
3. After User Story 1:
   - Developer A: User Story 2 (validation enhancements)
   - Developer B: User Story 3 (error reporting)
4. Both complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- User Story 1 is the MVP and fixes the immediate production issue
- User Stories 2 and 3 enhance the solution but US1 alone solves the problem
- Verify backward compatibility with all existing migrations (001-004)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

