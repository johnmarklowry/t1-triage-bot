# Tasks: Improve Slack Home Tab - Agent 1 (Critical Async Fixes)

**Agent Assignment**: Agent 1 - Critical Path Implementation  
**Dependencies**: Must complete Phase 1 setup tasks first  
**Blocks**: Agent 2 and Agent 3 cannot start until Phase 2 (Foundational) is complete  
**Can Start**: Immediately after Phase 1 setup

**Focus**: Fix critical async data loading issues and ensure home tab works correctly with async database operations. This is the foundation that all other improvements depend on.

## Phase 1: Setup (Shared - Complete First)

- [x] T001 Review current `buildHomeView()` implementation in appHome.js to understand existing structure
- [x] T002 Review `formatCurrentText()`, `formatNextText()`, and `formatDisciplines()` functions in appHome.js
- [x] T003 Review `getCurrentOnCall()` and `getNextOnCall()` functions in appHome.js to identify async conversion needs
- [x] T004 Review `app_home_opened` event handler in appHome.js to understand current data loading pattern

## Phase 2: Foundational (Blocking Prerequisites) - Agent 1

**Purpose**: Critical fixes that MUST be complete before any other work can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Convert `getCurrentOnCall()` function in appHome.js to async function using `await` for data access
- [x] T006 Convert `getNextOnCall()` function in appHome.js to async function using `await` for data access
- [x] T007 Update `buildUpcomingSprintsModal()` function in appHome.js to use `await` for async data access
- [x] T008 Update `app_home_opened` event handler in appHome.js to use `await` for all async data operations (getCurrentOnCall, getNextOnCall, readDisciplines)
- [x] T009 Add Promise.all() pattern in `app_home_opened` event handler in appHome.js for parallel data loading to optimize performance
- [x] T010 Add basic try-catch error handling in `app_home_opened` event handler in appHome.js with error logging

**Checkpoint**: After Phase 2, Agent 2 and Agent 3 can start their work ✅

## Phase 3: User Story 1 - Fix Async Data Loading & Basic Error Handling (Priority: P1) 🎯 MVP

**Goal**: Ensure home tab works correctly with async database operations and handles basic error scenarios gracefully. This is critical because the current synchronous implementation will break with the database.

**Independent Test**: Home tab loads successfully when opened in Slack. Verify by opening the app home tab and confirming current rotation, next rotation, and discipline lists display correctly. Test with database enabled and disabled (JSON fallback).

### Implementation for User Story 1

- [x] T011 [US1] Verify `getCurrentOnCall()` function in appHome.js handles null/undefined sprint data gracefully
- [x] T012 [US1] Verify `getNextOnCall()` function in appHome.js handles null/undefined sprint data gracefully
- [x] T013 [US1] Add error handling in `getCurrentOnCall()` function in appHome.js for database/JSON read failures
- [x] T014 [US1] Add error handling in `getNextOnCall()` function in appHome.js for database/JSON read failures
- [x] T015 [US1] Update `buildUpcomingSprintsModal()` function in appHome.js to handle async operations and errors properly
- [x] T016 [US1] Add logging in `app_home_opened` event handler in appHome.js for successful data loading operations
- [ ] T017 [US1] Test async data loading with database enabled (USE_DATABASE=true) and verify home tab renders correctly
- [ ] T018 [US1] Test async data loading with database disabled (USE_DATABASE=false) and verify JSON fallback works correctly
- [ ] T019 [US1] Verify event handler response time is under 3 seconds when loading data from database

**Checkpoint**: At this point, User Story 1 should be fully functional - home tab loads async data correctly, handles errors gracefully, and responds within 3 seconds ✅

## Notes

- This agent handles the critical path implementation
- Must complete Phase 2 (T005-T010) before Agent 2 and Agent 3 can start
- Must complete User Story 1 (T011-T019) before Agent 2 can start visual improvements
- Coordinate with other agents if issues are found
- Focus on making async data loading work correctly - this is the foundation for all other improvements

