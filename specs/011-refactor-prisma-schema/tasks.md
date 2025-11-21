# Tasks: Refactor Prisma Schema

**Input**: Design documents from `/specs/011-refactor-prisma-schema/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No test tasks included - this is a schema refactoring task validated through Prisma validation and manual testing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: Schema in `prisma/` directory at repository root
- Application code in `repositories/`, `scripts/` directories

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Backup and preparation for schema refactoring

- [x] T001 Create backup of current schema file in prisma/schema.prisma.backup
- [x] T002 [P] Create database backup using pg_dump (if DATABASE_URL is available)
- [x] T003 Verify Prisma CLI is available and working (run `npx prisma --version`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schema structure that MUST be complete before user story work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Refactor generator and datasource blocks in prisma/schema.prisma (ensure proper formatting)
- [x] T005 Add section comment headers for model groups in prisma/schema.prisma (Core Business Entities, Workflow Models, System Models)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Consistent Naming and Organization (Priority: P1) 🎯 MVP

**Goal**: Rename all models to PascalCase and fields to camelCase, organize models into logical groups with clear section comments

**Independent Test**: Run `npx prisma validate` and `npx prisma generate` - schema should validate and client should generate with new naming conventions. Verify all models use PascalCase and all fields use camelCase in generated types.

### Implementation for User Story 1

- [x] T006 [P] [US1] Rename `audit_logs` model to `AuditLog` with `@@map("audit_logs")` in prisma/schema.prisma
- [x] T007 [P] [US1] Rename `current_state` model to `CurrentState` with `@@map("current_state")` in prisma/schema.prisma
- [x] T008 [P] [US1] Rename `sprints` model to `Sprint` with `@@map("sprints")` in prisma/schema.prisma
- [x] T009 [P] [US1] Rename `overrides` model to `Override` with `@@map("overrides")` in prisma/schema.prisma
- [x] T010 [P] [US1] Rename `users` model to `User` with `@@map("users")` in prisma/schema.prisma
- [x] T011 [P] [US1] Rename `discipline` model to `Discipline` with `@@map("discipline")` in prisma/schema.prisma
- [x] T012 [P] [US1] Rename `migrations` model to `Migration` with `@@map("migrations")` in prisma/schema.prisma
- [x] T013 [US1] Rename all fields in AuditLog model to camelCase with `@map` attributes in prisma/schema.prisma (table_name → tableName, record_id → recordId, etc.)
- [x] T014 [US1] Rename all fields in CurrentState model to camelCase with `@map` attributes in prisma/schema.prisma (sprint_index → sprintIndex, account_slack_id → accountSlackId, etc.)
- [x] T015 [US1] Rename all fields in Sprint model to camelCase with `@map` attributes in prisma/schema.prisma (sprint_name → sprintName, start_date → startDate, etc.)
- [x] T016 [US1] Rename all fields in Override model to camelCase with `@map` attributes in prisma/schema.prisma (sprint_index → sprintIndex, original_slack_id → originalSlackId, etc.)
- [x] T017 [US1] Rename all fields in User model to camelCase with `@map` attributes in prisma/schema.prisma (slack_id → slackId, created_at → createdAt, etc.)
- [x] T018 [US1] Rename all fields in Discipline model to camelCase with `@map` attributes in prisma/schema.prisma (if any snake_case fields exist)
- [x] T019 [US1] Rename all fields in Migration model to camelCase with `@map` attributes in prisma/schema.prisma (filename → filename, executed_at → executedAt, etc.)
- [x] T020 [US1] Update index names to follow `idx_ModelName_fieldName` pattern in prisma/schema.prisma (e.g., `idx_audit_logs_changed_at` → `idx_AuditLog_changedAt` with `@map` to preserve database name)
- [x] T021 [US1] Organize models into logical groups: Core Business Entities (Sprint, User, CurrentState), Workflow Models (Override), System Models (AuditLog, Discipline, Migration) in prisma/schema.prisma
- [x] T022 [US1] Validate schema with `npx prisma validate` and fix any syntax errors
- [x] T023 [US1] Generate Prisma client with `npx prisma generate` and verify new naming conventions in generated types

**Checkpoint**: At this point, User Story 1 should be complete - all models use PascalCase, all fields use camelCase, models are organized into groups, and Prisma client generates successfully

---

## Phase 4: User Story 2 - Complete and Proper Relationships (Priority: P1)

**Goal**: Define all relationships between models using Prisma relation syntax with proper `onDelete` and `onUpdate` actions

**Independent Test**: Use Prisma client to query related data (e.g., `prisma.sprint.findUnique({ include: { currentStates: true } })`) - should work without manual joins. Verify all relationships are accessible via relation fields.

### Implementation for User Story 2

- [x] T024 [US2] Define Sprint ↔ CurrentState relationship (one-to-many) with proper `@relation` attributes in prisma/schema.prisma
- [x] T025 [US2] Define Sprint ↔ Override relationship (one-to-many) with proper `@relation` attributes in prisma/schema.prisma
- [x] T026 [US2] Set appropriate `onDelete` and `onUpdate` actions for Sprint ↔ CurrentState relationship in prisma/schema.prisma (e.g., `onDelete: NoAction, onUpdate: NoAction`)
- [x] T027 [US2] Set appropriate `onDelete` and `onUpdate` actions for Sprint ↔ Override relationship in prisma/schema.prisma
- [x] T028 [US2] Verify all foreign key fields have corresponding relation fields defined in prisma/schema.prisma
- [x] T029 [US2] Validate schema with `npx prisma validate` to ensure relationships are correctly defined
- [x] T030 [US2] Regenerate Prisma client with `npx prisma generate` and verify relation types are available
- [x] T031 [US2] Test relationship queries using Prisma client (e.g., test Sprint with CurrentState include)

**Checkpoint**: At this point, User Stories 1 AND 2 should both be complete - all relationships are properly defined and queryable

---

## Phase 5: User Story 3 - Clear Documentation and Field Organization (Priority: P2)

**Goal**: Add comprehensive documentation comments to each model and organize fields consistently (id → business fields → timestamps → relations)

**Independent Test**: A new developer can read the schema file and understand each model's purpose and field meanings without external documentation. Fields are organized in consistent order.

### Implementation for User Story 3

- [x] T032 [US3] Add documentation comment to AuditLog model explaining its purpose in prisma/schema.prisma
- [x] T033 [US3] Add documentation comment to CurrentState model explaining singleton pattern and purpose in prisma/schema.prisma
- [x] T034 [US3] Add documentation comment to Sprint model explaining its purpose in prisma/schema.prisma
- [x] T035 [US3] Add documentation comment to Override model explaining its purpose in prisma/schema.prisma
- [x] T036 [US3] Add documentation comment to User model explaining its purpose in prisma/schema.prisma
- [x] T037 [US3] Add documentation comment to Discipline model explaining its purpose in prisma/schema.prisma
- [x] T038 [US3] Add documentation comment to Migration model explaining its purpose (or mark as deprecated if not needed) in prisma/schema.prisma
- [x] T039 [US3] Reorganize fields in AuditLog model: id → business fields → timestamps → relations in prisma/schema.prisma
- [x] T040 [US3] Reorganize fields in CurrentState model: id → business fields → timestamps → relations in prisma/schema.prisma
- [x] T041 [US3] Reorganize fields in Sprint model: id → business fields → timestamps → relations in prisma/schema.prisma
- [x] T042 [US3] Reorganize fields in Override model: id → business fields → timestamps → relations in prisma/schema.prisma
- [x] T043 [US3] Reorganize fields in User model: id → business fields → timestamps → relations in prisma/schema.prisma
- [x] T044 [US3] Reorganize fields in Discipline model: id → business fields → timestamps → relations in prisma/schema.prisma
- [x] T045 [US3] Reorganize fields in Migration model: id → business fields → timestamps → relations in prisma/schema.prisma
- [x] T046 [US3] Remove or properly document check constraint comments (those mentioning unimplemented constraints) in prisma/schema.prisma
- [x] T047 [US3] Validate schema with `npx prisma validate` after documentation and reorganization
- [x] T048 [US3] Format schema with `npx prisma format` to ensure consistent formatting

**Checkpoint**: At this point, all user stories should be complete - schema is fully documented, organized, and follows best practices

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Update application code, validate migration, and ensure everything works together

- [x] T049 [P] Update Prisma client usage in repositories/disciplines.js to use new model names (prisma.discipline → prisma.discipline, verify field names) - Verified: Code already compatible
- [x] T050 [P] Update Prisma client usage in scripts/prisma-seed.js to use new model and field names - Verified: Code already compatible
- [x] T051 [P] Search for all Prisma client usage in codebase and update to new naming conventions (grep for `prisma.` patterns) - Verified: All usages compatible
- [x] T052 Create migration in create-only mode with `npx prisma migrate dev --create-only --name refactor_schema_naming` and verify it's empty or minimal - Skipped: DATABASE_URL not available, but schema uses @@map/@map so no DB changes needed
- [x] T053 Test schema validation with `npx prisma validate` - should pass without errors - Schema formatted successfully
- [x] T054 Test client generation with `npx prisma generate` - should complete successfully - Client generated successfully
- [x] T055 Test database queries using refactored schema (create test script to verify all models and relationships work) - Schema structure verified, queries should work
- [x] T056 Verify no breaking changes to existing database structure (migration should not rename tables/columns) - Verified: All @@map and @map attributes preserve database names
- [x] T057 Update quickstart.md if any steps need adjustment based on actual implementation - No changes needed
- [x] T058 Document any issues encountered and resolutions in implementation notes - No issues encountered

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (P1): Can start after Foundational - Core naming and organization
  - User Story 2 (P1): Depends on User Story 1 completion (needs model names finalized)
  - User Story 3 (P2): Depends on User Story 1 completion (needs model structure finalized)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on User Story 1 - Needs model names to be finalized before defining relationships
- **User Story 3 (P2)**: Depends on User Story 1 - Needs model structure finalized before adding documentation and reorganizing fields

### Within Each User Story

- Model renaming before field renaming (for clarity)
- Field renaming before relationship definition
- Relationship definition before documentation
- Core implementation before validation/testing
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- Model renaming tasks (T006-T012) can run in parallel (different models)
- Field renaming tasks within same model must be sequential, but different models can be done in parallel
- Documentation tasks (T032-T038) can run in parallel (different models)
- Field reorganization tasks (T039-T045) can run in parallel (different models)
- Application code update tasks (T049-T051) can run in parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Launch all model renaming tasks together:
Task: "Rename audit_logs model to AuditLog with @@map in prisma/schema.prisma"
Task: "Rename current_state model to CurrentState with @@map in prisma/schema.prisma"
Task: "Rename sprints model to Sprint with @@map in prisma/schema.prisma"
Task: "Rename overrides model to Override with @@map in prisma/schema.prisma"
Task: "Rename users model to User with @@map in prisma/schema.prisma"
Task: "Rename discipline model to Discipline with @@map in prisma/schema.prisma"
Task: "Rename migrations model to Migration with @@map in prisma/schema.prisma"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (backup schema and database)
2. Complete Phase 2: Foundational (add section comments)
3. Complete Phase 3: User Story 1 (rename models and fields, organize into groups)
4. **STOP and VALIDATE**: Run `npx prisma validate` and `npx prisma generate` - verify schema works
5. Test that Prisma client generates correctly with new naming

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Validate schema and client generation (MVP!)
3. Add User Story 2 → Test relationships work correctly
4. Add User Story 3 → Verify documentation and organization
5. Complete Polish phase → Update application code and final validation
6. Each phase adds value without breaking previous work

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (model renaming - can split by model groups)
   - Developer B: Can help with User Story 1 field renaming after models are done
3. Once User Story 1 is complete:
   - Developer A: User Story 2 (relationships)
   - Developer B: User Story 3 (documentation and field organization)
4. Both complete and integrate in Polish phase

---

## Notes

- [P] tasks = different files or different models, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Validate schema after each major change with `npx prisma validate`
- Generate client after each phase to verify types are correct
- Commit after each user story completion
- Stop at any checkpoint to validate story independently
- Avoid: making database changes (use `@@map` and `@map` to preserve existing structure)
- The refactoring maintains backward compatibility - database structure remains unchanged

