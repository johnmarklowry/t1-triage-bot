# Tasks: Add Speckit Planning System

**Input**: Design documents from `/specs/001-add-speckit/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Manual validation of generated artifacts; no automated test tasks included as per specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Development tooling**: Scripts in `.specify/scripts/bash/`, templates in `.specify/templates/`
- **Feature artifacts**: Generated in `specs/[###-feature-name]/` directory

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing infrastructure and prepare for workflow implementation

- [ ] T001 Verify `.specify/scripts/bash/setup-plan.sh` exists and has correct branch validation logic
- [ ] T002 [P] Verify `.specify/scripts/bash/common.sh` provides required functions (get_repo_root, get_current_branch, get_feature_paths)
- [ ] T003 [P] Verify `.specify/templates/plan-template.md` exists with constitution check section
- [ ] T004 [P] Verify `.specify/memory/constitution.md` exists and is properly formatted

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Verify bash scripts are executable and have proper error handling
- [ ] T006 Verify template files are accessible and contain required placeholder tokens
- [ ] T007 Verify feature branch naming validation works correctly (numeric prefix pattern)
- [ ] T008 Verify path resolution logic correctly maps branch names to spec directories

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Execute Planning Workflow (Priority: P1) 🎯 MVP

**Goal**: Implement core planning workflow that generates implementation plans from feature specifications with research, data models, and contracts.

**Independent Test**: Can be fully tested by running `/speckit.plan` on a feature branch with a spec.md file and verifying that research.md, data-model.md, contracts/, and quickstart.md are generated.

### Implementation for User Story 1

- [ ] T009 [US1] Implement Phase 0 research generation logic in `/speckit.plan` command handler to create research.md from technical context
- [ ] T010 [US1] Implement placeholder replacement logic for plan.md template processing (replace [FEATURE_NAME], [DATE], etc.)
- [ ] T011 [US1] Implement constitution check section population in plan.md generation (load constitution.md and populate check questions)
- [ ] T012 [US1] Implement Phase 1 data model generation logic to create data-model.md from spec.md entities
- [ ] T013 [US1] Implement Phase 1 contracts generation logic to create contracts/ directory structure (or README.md if no APIs)
- [ ] T014 [US1] Implement Phase 1 quickstart generation logic to create quickstart.md with usage instructions
- [ ] T015 [US1] Implement workflow orchestration to execute Phase 0 then Phase 1 in sequence
- [ ] T016 [US1] Add error handling for missing spec.md file with clear error message
- [ ] T017 [US1] Add validation to ensure all "NEEDS CLARIFICATION" items are resolved before Phase 1
- [ ] T018 [US1] Implement file generation with proper directory creation (mkdir -p for specs/[###-feature-name]/)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently - running `/speckit.plan` should generate all required artifacts

---

## Phase 4: User Story 2 - Constitution Compliance Checking (Priority: P2)

**Goal**: Implement automatic constitution compliance checking during planning workflow to ensure all features align with project principles.

**Independent Test**: Can be tested by creating a plan that violates constitution principles and verifying the check flags it appropriately.

### Implementation for User Story 2

- [ ] T019 [US2] Implement constitution loading logic to read `.specify/memory/constitution.md` and parse principles
- [ ] T020 [US2] Implement compliance check questions generation based on constitution principles (I-V)
- [ ] T021 [US2] Implement compliance status evaluation logic (✅ Compliant / ⚠️ Needs Justification)
- [ ] T022 [US2] Add validation for Slack API compliance checks when feature interacts with Slack APIs
- [ ] T023 [US2] Add validation for configuration management checks (verify .env.example updates)
- [ ] T024 [US2] Implement complexity tracking section population when violations are detected
- [ ] T025 [US2] Add warning/error output when constitution violations are found during plan generation

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - planning workflow includes constitution compliance checking

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T026 [P] Update `.specify/scripts/bash/update-agent-context.sh` integration to run after Phase 1 completion
- [ ] T027 [P] Add logging/console output for workflow progress (Phase 0 starting, Phase 1 starting, etc.)
- [ ] T028 Add validation for generated artifact completeness (verify all required files were created)
- [ ] T029 Add summary output at end of workflow showing generated artifacts and their paths
- [ ] T030 [P] Document workflow in quickstart.md with troubleshooting section
- [ ] T031 Run end-to-end validation: execute `/speckit.plan` on test feature and verify all artifacts
- [ ] T032 Verify constitution compliance check works correctly with test cases (compliant and non-compliant features)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Depends on US1 for plan.md generation, but compliance checking can be implemented independently

### Within Each User Story

- Core workflow logic before enhancements
- File generation before validation
- Error handling throughout
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T002, T003, T004)
- All Foundational tasks can run sequentially (validation tasks)
- Once Foundational phase completes, user stories can start in parallel
- Polish tasks marked [P] can run in parallel (T026, T027, T030)

---

## Parallel Example: User Story 1

```bash
# These tasks can run in parallel as they work on different aspects:
Task: "Implement Phase 0 research generation logic"
Task: "Implement placeholder replacement logic for plan.md template processing"
Task: "Implement constitution check section population"

# These can run in parallel as they generate different artifacts:
Task: "Implement Phase 1 data model generation logic"
Task: "Implement Phase 1 contracts generation logic"
Task: "Implement Phase 1 quickstart generation logic"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup - Verify existing infrastructure
2. Complete Phase 2: Foundational - Validate core scripts and templates
3. Complete Phase 3: User Story 1 - Implement core planning workflow
4. **STOP and VALIDATE**: Test User Story 1 independently by running `/speckit.plan` on a test feature
5. Verify all artifacts are generated correctly

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Verify workflow generates all artifacts (MVP!)
3. Add User Story 2 → Test independently → Verify constitution compliance checking works
4. Add Polish tasks → Enhance workflow with better logging and validation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (core workflow)
   - Developer B: User Story 2 (constitution checking) - can start after US1 plan generation is working
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Manual testing via workflow execution is the primary validation method
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence



