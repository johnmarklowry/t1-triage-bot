# Tasks: Fix 5PM Check Time Error - Agent 3 (Code Review & Other Callers)

**Agent Assignment**: Agent 3 - Code Review & Impact Analysis  
**Dependencies**: Can start after Phase 1 & 2 setup tasks complete  
**Can Start**: Immediately after setup, no need to wait for Agent 1 implementation

**Focus**: Review other callers of parsePTDate() and check if formatPTDate() needs similar validation.

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

## Phase 4: Code Review & Impact Analysis (Agent 3)

### Review Other Callers (Can start immediately after Phase 2)

- [x] T027 [P] Review `findCurrentSprint()` function in dataUtils.js to ensure it handles null returns from `parsePTDate()` appropriately
- [x] T027 [P] Review `findNextSprint()` function in dataUtils.js to ensure it handles null returns from `parsePTDate()` appropriately
- [x] T027 [P] Review `scheduleCommandHandler.js` to ensure it handles null returns from `parsePTDate()` appropriately
- [x] T027 [P] Document any callers that need updates to handle null returns from `parsePTDate()`

**T027 Findings**: All callers properly handle null returns from `parsePTDate()`. No changes needed.
- `findCurrentSprint()`: ✅ Skips sprints with invalid dates (lines 356-358, 385-387)
- `findNextSprint()`: ✅ N/A - does not call parsePTDate() directly
- `scheduleCommandHandler.js`: ✅ Skips sprints with invalid dates (lines 32-34)
- `getUpcomingSprints()`: ✅ Filters out sprints with invalid dates (lines 521-523)

### Review formatPTDate() Function

- [x] T028 [P] Review `formatPTDate()` function in dataUtils.js to determine if similar validation is needed
- [x] T028 [P] Check if `formatPTDate()` has the same vulnerability (constructing date strings without validation)
- [x] T028 [P] If needed, create recommendations for enhancing `formatPTDate()` with similar validation

**T028 Findings**: `formatPTDate()` has the same vulnerability as `parsePTDate()` had before enhancement.
- **Issue**: No validation for null/undefined/empty strings or invalid formats
- **Risk**: MEDIUM - Could throw "Invalid time value" errors in callers
- **Recommendation**: Enhance `formatPTDate()` with similar validation (see agent3-analysis.md for details)
- **Priority**: MEDIUM (not critical since parsePTDate() is fixed, but recommended for consistency)

## Notes

- This agent can work independently after setup
- Focus on identifying potential issues in other parts of the codebase
- Document findings for follow-up work if needed
- No blocking dependencies on Agent 1 or Agent 2

