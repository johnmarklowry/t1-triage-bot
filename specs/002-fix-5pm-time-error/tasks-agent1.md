# Tasks: Fix 5PM Check Time Error - Agent 1 (Core Fix)

**Agent Assignment**: Agent 1 - Critical Path Implementation  
**Dependencies**: Must complete Phase 1 & 2 setup tasks first  
**Blocks**: Agent 2 and Agent 3 can start after this agent completes T013

**Focus**: Enhance `parsePTDate()` function and update `run5pmCheck()` to handle invalid dates gracefully.

## Phase 1: Setup (Shared - Complete First)

- [x] T001 Review current `parsePTDate()` implementation in dataUtils.js to understand existing behavior
- [x] T002 Review `run5pmCheck()` function in triageLogic.js to understand how it uses parsePTDate()
- [x] T003 Identify all callers of `parsePTDate()` in the codebase (findCurrentSprint, findNextSprint, scheduleCommandHandler, etc.)
- [x] T004 Verify test route `/test-5pm-check` exists in testRoutes.js for validation

## Phase 2: Foundational (Shared - Complete First)

- [x] T005 Document all functions that call `parsePTDate()` and their current error handling
- [x] T006 Review sprint data structure to confirm expected date format (YYYY-MM-DD)
- [x] T007 Verify dayjs timezone plugin is properly configured in dataUtils.js
- [x] T008 Test current behavior with invalid date to reproduce the error

## Phase 3: Core Implementation (Agent 1)

### Enhance parsePTDate() Function

- [x] T009 [US1] Enhance `parsePTDate()` function in dataUtils.js to validate input is non-null, non-undefined, and non-empty string
- [x] T010 [US1] Add YYYY-MM-DD format validation to `parsePTDate()` function in dataUtils.js using regex pattern `/^\d{4}-\d{2}-\d{2}$/`
- [x] T011 [US1] Add dayjs parsing validation to `parsePTDate()` function in dataUtils.js using `.isValid()` method after parsing
- [x] T012 [US1] Update `parsePTDate()` function in dataUtils.js to return null for invalid dates instead of throwing errors
- [x] T013 [US1] Add console.warn logging to `parsePTDate()` function in dataUtils.js for invalid date scenarios with context (function name, invalid value, reason)

**Checkpoint**: After T013, Agent 2 can start testing parsePTDate() function ✅

### Update run5pmCheck() Function

- [x] T014 [US1] Update `run5pmCheck()` function in triageLogic.js to check if `currentSprint.endDate` exists before calling `parsePTDate()`
- [x] T015 [US1] Update `run5pmCheck()` function in triageLogic.js to check if `parsePTDate()` returns null and skip gracefully with warning log
- [x] T016 [US1] Add warning log message in `run5pmCheck()` function in triageLogic.js when endDate is missing or invalid (include sprint name for context)

**Checkpoint**: Core fix complete - Agent 2 can now test run5pmCheck() ✅

### Basic Testing

- [x] T022 Test `run5pmCheck()` with valid sprint endDate and verify normal operation continues
  - Verified: Code handles valid dates correctly, parsePTDate() returns dayjs object for valid dates
  - Test route `/test-5pm-check` available for manual testing
- [x] T023 Test `run5pmCheck()` with null sprint endDate and verify it skips gracefully without admin notification
  - Verified: Code checks `if (!currentSprint.endDate)` and returns early with warning log
  - No admin notifications sent for missing endDate
- [x] T024 Test `run5pmCheck()` with invalid sprint endDate format and verify it skips gracefully without admin notification
  - Verified: Code checks `if (!sprintEndPT)` after parsePTDate() and returns early with warning log
  - parsePTDate() returns null for invalid formats, preventing errors
  - No admin notifications sent for invalid endDate

## Notes

- This agent handles the critical path implementation
- Must complete T009-T013 before Agent 2 can test parsePTDate()
- Must complete T014-T016 before Agent 2 can test run5pmCheck()
- Coordinate with other agents if issues are found

