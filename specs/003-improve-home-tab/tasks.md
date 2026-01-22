# Tasks: Improve Slack Home Tab with Block Kit Best Practices

**Input**: Design documents from `/specs/003-improve-home-tab/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Manual testing via Slack integration - no automated test tasks included (not requested in spec).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Agent Assignments**: Tasks have been split into agent-specific files for parallel execution:
- **Agent 1** (Critical Async Fixes): See `tasks-agent1.md` - Handles Phase 2 (Foundational) + User Story 1
- **Agent 2** (Visual Improvements): See `tasks-agent2.md` - Handles User Story 2 (Block Kit improvements)
- **Agent 3** (Error Handling & Testing): See `tasks-agent3.md` - Handles User Story 3 + Polish phase

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project structure:
- `appHome.js` - Main home tab implementation
- `dataUtils.js` - Data access layer (already exists)
- `testRoutes.js` - Test routes for validation (already exists)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Review current implementation and prepare for improvements

- [ ] T001 Review current `buildHomeView()` implementation in appHome.js to understand existing structure
- [ ] T002 Review `formatCurrentText()`, `formatNextText()`, and `formatDisciplines()` functions in appHome.js
- [ ] T003 Review `getCurrentOnCall()` and `getNextOnCall()` functions in appHome.js to identify async conversion needs
- [ ] T004 Review `app_home_opened` event handler in appHome.js to understand current data loading pattern

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Critical fixes that MUST be complete before visual improvements can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Convert `getCurrentOnCall()` function in appHome.js to async function using `await` for data access
- [ ] T006 Convert `getNextOnCall()` function in appHome.js to async function using `await` for data access
- [ ] T007 Update `buildUpcomingSprintsModal()` function in appHome.js to use `await` for async data access
- [ ] T008 Update `app_home_opened` event handler in appHome.js to use `await` for all async data operations (getCurrentOnCall, getNextOnCall, readDisciplines)
- [ ] T009 Add Promise.all() pattern in `app_home_opened` event handler in appHome.js for parallel data loading to optimize performance
- [ ] T010 Add basic try-catch error handling in `app_home_opened` event handler in appHome.js with error logging

**Checkpoint**: Foundation ready - async data loading is working, event handler responds within 3 seconds, basic error handling in place

---

## Phase 3: User Story 1 - Fix Async Data Loading & Basic Error Handling (Priority: P1) 🎯 MVP

**Goal**: Ensure home tab works correctly with async database operations and handles basic error scenarios gracefully. This is critical because the current synchronous implementation will break with the database.

**Independent Test**: Home tab loads successfully when opened in Slack. Verify by opening the app home tab and confirming current rotation, next rotation, and discipline lists display correctly. Test with database enabled and disabled (JSON fallback).

### Implementation for User Story 1

- [ ] T011 [US1] Verify `getCurrentOnCall()` function in appHome.js handles null/undefined sprint data gracefully
- [ ] T012 [US1] Verify `getNextOnCall()` function in appHome.js handles null/undefined sprint data gracefully
- [ ] T013 [US1] Add error handling in `getCurrentOnCall()` function in appHome.js for database/JSON read failures
- [ ] T014 [US1] Add error handling in `getNextOnCall()` function in appHome.js for database/JSON read failures
- [ ] T015 [US1] Update `buildUpcomingSprintsModal()` function in appHome.js to handle async operations and errors properly
- [ ] T016 [US1] Add logging in `app_home_opened` event handler in appHome.js for successful data loading operations
- [ ] T017 [US1] Test async data loading with database enabled (USE_DATABASE=true) and verify home tab renders correctly
- [ ] T018 [US1] Test async data loading with database disabled (USE_DATABASE=false) and verify JSON fallback works correctly
- [ ] T019 [US1] Verify event handler response time is under 3 seconds when loading data from database

**Checkpoint**: At this point, User Story 1 should be fully functional - home tab loads async data correctly, handles errors gracefully, and responds within 3 seconds

---

## Phase 4: User Story 2 - Improve Visual Hierarchy with Block Kit Best Practices (Priority: P2)

**Goal**: Refactor home tab to use Block Kit best practices for better visual hierarchy, readability, and information organization. Use header blocks, context blocks, and section blocks with fields instead of long markdown text strings.

**Independent Test**: Home tab displays with improved visual hierarchy. Verify by opening the app home tab and confirming:
- Header blocks are used for section titles
- Context blocks display date metadata
- Section blocks use fields array for compact label-value pairs
- Information is easier to scan and read
- Visual separation between sections is clear

### Implementation for User Story 2

- [ ] T020 [US2] Create `buildHeaderBlock()` helper function in appHome.js for generating header blocks with consistent styling
- [ ] T021 [US2] Create `buildContextBlock()` helper function in appHome.js for generating context blocks with date/metadata information
- [ ] T022 [US2] Refactor `formatCurrentText()` function in appHome.js to return Block Kit blocks instead of markdown text string
- [ ] T023 [US2] Refactor `formatNextText()` function in appHome.js to return Block Kit blocks instead of markdown text string
- [ ] T024 [US2] Create `buildCurrentRotationBlocks()` function in appHome.js that uses header block, section block with fields for dates, context block for date range, and section blocks for user roles
- [ ] T025 [US2] Create `buildNextRotationBlocks()` function in appHome.js following same pattern as buildCurrentRotationBlocks
- [ ] T026 [US2] Refactor `buildHomeView()` function in appHome.js to use new block-building functions instead of text formatting functions
- [ ] T027 [US2] Update `buildHomeView()` function in appHome.js to use header block for main title instead of section block
- [ ] T028 [US2] Update current rotation section in `buildHomeView()` function in appHome.js to use section blocks with fields array for start/end dates
- [ ] T029 [US2] Add context block after current rotation section in `buildHomeView()` function in appHome.js to display formatted date range
- [ ] T030 [US2] Update next rotation section in `buildHomeView()` function in appHome.js to use section blocks with fields array for start/end dates
- [ ] T031 [US2] Add context block after next rotation section in `buildHomeView()` function in appHome.js to display formatted date range
- [ ] T032 [US2] Update user role display in rotation sections to use section blocks with fields or context elements for better formatting
- [ ] T033 [US2] Refactor `formatDisciplines()` function in appHome.js to return Block Kit blocks instead of markdown text string
- [ ] T034 [US2] Update discipline lists section in `buildHomeView()` function in appHome.js to use header block and section blocks with fields
- [ ] T035 [US2] Add JSDoc comments to all new block-building helper functions in appHome.js documenting Block Kit structure and purpose
- [ ] T036 [US2] Verify total block count in `buildHomeView()` function in appHome.js does not exceed 50 blocks (Slack API limit)
- [ ] T037 [US2] Test home tab rendering in Slack to verify visual hierarchy improvements display correctly
- [ ] T038 [US2] Verify home tab is more scannable and readable compared to previous implementation

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - home tab loads async data correctly AND displays with improved visual hierarchy using Block Kit best practices

---

## Phase 5: User Story 3 - Enhanced Error Handling & Testing Infrastructure (Priority: P3)

**Goal**: Add comprehensive error handling, fallback views for missing data scenarios, and test routes for validation. This ensures the home tab provides a good user experience even when data is unavailable or errors occur.

**Independent Test**: Home tab handles error scenarios gracefully. Verify by:
- Testing with null current rotation (should show "No active sprint found" message)
- Testing with null next rotation (should show "No upcoming sprint scheduled" message)
- Testing with empty disciplines (should show "Discipline data unavailable" message)
- Testing with database unavailable (should show fallback view with error message)
- Using test route `/test/home-tab` to preview block structure without opening Slack

### Implementation for User Story 3

- [ ] T039 [US3] Create `buildFallbackView()` helper function in appHome.js that generates a home tab view with error message when data is unavailable
- [ ] T040 [US3] Update `buildCurrentRotationBlocks()` function in appHome.js to handle null current rotation and display "No active sprint found" message
- [ ] T041 [US3] Update `buildNextRotationBlocks()` function in appHome.js to handle null next rotation and display "No upcoming sprint scheduled" message
- [ ] T042 [US3] Update discipline lists section in `buildHomeView()` function in appHome.js to handle empty/null disciplines and display "Discipline data unavailable" message
- [ ] T043 [US3] Enhance error handling in `app_home_opened` event handler in appHome.js to publish fallback view when data loading fails completely
- [ ] T044 [US3] Add partial data handling in `app_home_opened` event handler in appHome.js - display available data and show warnings for missing sections
- [ ] T045 [US3] Add error context logging in `app_home_opened` event handler in appHome.js including which data source failed (database vs JSON)
- [ ] T046 [US3] Create test route `/test/home-tab` in testRoutes.js that returns JSON representation of home tab blocks for validation
- [ ] T047 [US3] Add test route `/test/home-tab?state=empty` in testRoutes.js to test home tab with no data
- [ ] T048 [US3] Add test route `/test/home-tab?state=no-current` in testRoutes.js to test home tab with missing current rotation
- [ ] T049 [US3] Add test route `/test/home-tab?state=no-next` in testRoutes.js to test home tab with missing next rotation
- [ ] T050 [US3] Add test route `/test/home-tab?state=no-disciplines` in testRoutes.js to test home tab with missing disciplines
- [ ] T051 [US3] Test fallback view displays correctly when all data is unavailable
- [ ] T052 [US3] Test partial data handling - verify available sections display and missing sections show appropriate messages
- [ ] T053 [US3] Verify error messages in home tab are user-friendly and actionable (not technical error details)
- [ ] T054 [US3] Document error handling patterns in code comments in appHome.js

**Checkpoint**: At this point, all user stories should work independently - home tab loads async data, displays with improved visual hierarchy, AND handles all error scenarios gracefully with fallback views and test routes

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final polish

- [ ] T055 [P] Add JSDoc documentation to `buildHomeView()` function in appHome.js describing Block Kit structure and design decisions
- [ ] T056 [P] Add JSDoc documentation to all block-building helper functions in appHome.js
- [ ] T057 [P] Update code comments in appHome.js to explain Block Kit best practices used
- [ ] T058 [P] Verify all Block Kit blocks conform to Slack API specification (validate block structure)
- [ ] T059 [P] Optimize block generation performance in `buildHomeView()` function in appHome.js (ensure it completes quickly)
- [ ] T060 [P] Review and optimize mrkdwn formatting in all block text fields in appHome.js for consistency
- [ ] T061 [P] Verify accessibility - ensure all blocks have descriptive text (not just emoji) in appHome.js
- [ ] T062 [P] Test home tab on both web and mobile Slack clients to ensure blocks render correctly on all platforms
- [ ] T063 [P] Update quickstart.md with new test routes and testing procedures
- [ ] T064 [P] Run quickstart.md validation checklist to verify all testing steps work correctly
- [ ] T065 [P] Code review - verify all async/await patterns are correct and error handling is comprehensive
- [ ] T066 [P] Performance testing - verify home tab loads within 3 seconds under various data scenarios
- [ ] T067 [P] Manual testing in Slack - verify home tab provides value to users and follows Block Kit best practices

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories should proceed sequentially in priority order (P1 → P2 → P3)
  - Each story builds on previous improvements
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
  - **Critical**: Must complete before other stories as it fixes broken async functionality
- **User Story 2 (P2)**: Can start after User Story 1 - Depends on async data loading working correctly
  - Builds on US1 by improving the display of data that's now loading correctly
- **User Story 3 (P3)**: Can start after User Story 2 - Depends on visual improvements being in place
  - Enhances error handling for the improved block structure from US2

### Within Each User Story

- Helper functions before functions that use them
- Block-building functions before buildHomeView updates
- Error handling before fallback views
- Core implementation before testing infrastructure

### Parallel Opportunities

- **Setup phase**: All review tasks (T001-T004) can run in parallel
- **Foundational phase**: T005-T007 can run in parallel (different functions), but T008-T010 depend on previous tasks
- **User Story 1**: T011-T014 can run in parallel (different functions), T015-T019 are sequential
- **User Story 2**: T020-T021 can run in parallel (helper functions), T022-T025 can run in parallel (refactoring different functions), T026-T038 are mostly sequential
- **User Story 3**: T039-T042 can run in parallel (different fallback handlers), T043-T045 are sequential, T046-T050 can run in parallel (test routes), T051-T054 are sequential
- **Polish phase**: Most tasks (T055-T067) can run in parallel as they're independent improvements

---

## Parallel Example: User Story 2

```bash
# Launch helper function creation in parallel:
Task: "Create buildHeaderBlock() helper function in appHome.js"
Task: "Create buildContextBlock() helper function in appHome.js"

# Launch refactoring tasks in parallel (different functions):
Task: "Refactor formatCurrentText() function in appHome.js"
Task: "Refactor formatNextText() function in appHome.js"
Task: "Refactor formatDisciplines() function in appHome.js"

# Launch block-building functions in parallel:
Task: "Create buildCurrentRotationBlocks() function in appHome.js"
Task: "Create buildNextRotationBlocks() function in appHome.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (review current implementation)
2. Complete Phase 2: Foundational (fix async data loading - CRITICAL)
3. Complete Phase 3: User Story 1 (verify async works, add basic error handling)
4. **STOP and VALIDATE**: Test User Story 1 independently - home tab loads correctly with async database
5. Deploy/demo if ready

**MVP Value**: Home tab works correctly with async database operations (critical fix)

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready (async data loading working)
2. Add User Story 1 → Test independently → Deploy/Demo (MVP - async works!)
3. Add User Story 2 → Test independently → Deploy/Demo (Improved visual hierarchy)
4. Add User Story 3 → Test independently → Deploy/Demo (Enhanced error handling)
5. Add Polish → Final validation → Deploy

Each story adds value without breaking previous stories.

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (async fixes)
   - Developer B: Can help with User Story 2 prep (research, planning)
3. Once User Story 1 complete:
   - Developer A: User Story 2 (visual improvements)
   - Developer B: User Story 3 (error handling)
4. Stories complete and integrate sequentially (US2 depends on US1, US3 depends on US2)

---

## Task Summary

- **Total Tasks**: 67
- **Setup Phase**: 4 tasks
- **Foundational Phase**: 6 tasks
- **User Story 1 (P1)**: 9 tasks
- **User Story 2 (P2)**: 19 tasks
- **User Story 3 (P3)**: 16 tasks
- **Polish Phase**: 13 tasks

### Parallel Opportunities Identified

- **Setup**: 4 tasks can run in parallel (all review tasks)
- **Foundational**: 3 tasks can run in parallel (T005-T007), rest sequential
- **User Story 1**: 4 tasks can run in parallel (T011-T014), rest sequential
- **User Story 2**: Multiple parallel opportunities (helper functions, refactoring tasks)
- **User Story 3**: Multiple parallel opportunities (fallback handlers, test routes)
- **Polish**: Most tasks can run in parallel (independent improvements)

### Independent Test Criteria

- **User Story 1**: Home tab loads successfully when opened in Slack. Verify current rotation, next rotation, and discipline lists display correctly with async database.
- **User Story 2**: Home tab displays with improved visual hierarchy using header blocks, context blocks, and section blocks with fields. Information is easier to scan.
- **User Story 3**: Home tab handles error scenarios gracefully with fallback views and appropriate error messages. Test routes work for validation.

### Suggested MVP Scope

**MVP = User Story 1 Only** (P1)
- Fixes critical async data loading issue
- Ensures home tab works with database
- Adds basic error handling
- Can be tested and deployed independently
- Delivers value: Home tab actually works correctly

**Extended MVP = User Story 1 + User Story 2** (P1 + P2)
- All of MVP benefits
- Plus improved visual hierarchy and user experience
- Still independently testable
- Significant value improvement

---

## Notes

- [P] tasks = different files or functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- All file paths are relative to repository root
- Tasks are ordered for sequential execution within phases, but parallel opportunities are marked
- Response time must be <3 seconds (Slack API requirement)
- Block count must not exceed 50 blocks (Slack API limit)

