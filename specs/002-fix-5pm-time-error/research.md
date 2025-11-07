# Phase 0: Research & Technology Decisions

## Research Tasks

### 1. Date Format Handling in dataUtils

**Decision**: Enhance `parsePTDate()` function to validate input before parsing and return null for invalid dates instead of throwing errors.

**Rationale**: 
- The current `parsePTDate()` function assumes valid input and constructs `${dateStr}T00:00:00` without validation
- When `endDate` is null, undefined, or invalid format, this creates strings like `nullT00:00:00` or `undefinedT00:00:00`
- dayjs.tz() throws "Invalid time value" error when given these invalid strings
- Fixing at the source (`parsePTDate()`) protects all callers, not just `run5pmCheck()`
- Sprint dates are expected in YYYY-MM-DD format (e.g., "2025-03-18") based on sprints.json structure

**Alternatives considered**:
- Add validation only in `run5pmCheck()`: Would fix this specific error but leave other callers vulnerable
- Wrap all `parsePTDate()` calls in try-catch: More verbose, doesn't prevent the root cause
- Use dayjs validation methods: dayjs provides `.isValid()` method that can check before parsing

### 2. Error Handling Strategy

**Decision**: Return null for invalid dates and let callers check for null, with appropriate logging.

**Rationale**:
- Returning null allows callers to handle invalid dates gracefully
- Logging warnings provides debugging information without crashing
- Follows existing error handling patterns in the codebase (e.g., `findCurrentSprint()` returns null when no sprint found)
- Prevents error notifications to admin channel for data validation issues

**Alternatives considered**:
- Throw custom errors: Would require try-catch at every call site, more complex
- Return invalid dayjs object: Callers would need to check `.isValid()`, less explicit than null

### 3. Date Validation Approach

**Decision**: Validate that dateStr is a non-empty string matching YYYY-MM-DD format before parsing.

**Rationale**:
- Sprint dates are stored as YYYY-MM-DD strings (ISO date format)
- Simple regex or string validation can catch null/undefined/empty cases
- dayjs can parse YYYY-MM-DD format reliably
- Check for null/undefined/empty first, then validate format, then parse

**Validation steps**:
1. Check if dateStr is null, undefined, or empty string → return null with warning
2. Check if dateStr matches YYYY-MM-DD pattern → return null with warning if not
3. Attempt parsing with dayjs.tz() → return null with warning if invalid
4. Return parsed dayjs object if all checks pass

**Alternatives considered**:
- Only check null/undefined: Would miss invalid format strings
- Use dayjs.isValid() after parsing: Less efficient, still throws error during parsing
- Complex format detection: Overkill for known YYYY-MM-DD format

### 4. Logging Strategy

**Decision**: Log warnings with context (function name, invalid value) but don't send admin notifications for validation failures.

**Rationale**:
- Validation failures are data issues, not system errors
- Admin notifications should be reserved for system-level errors
- Console warnings provide sufficient debugging information
- Follows constitution principle III (Error Handling & Resilience) - log with context

**Alternatives considered**:
- Silent failures: Would make debugging harder
- Admin notifications: Would spam admin channel for data issues
- Error-level logging: Too severe for validation failures

### 5. Backward Compatibility

**Decision**: Ensure `parsePTDate()` changes don't break existing valid date processing.

**Rationale**:
- Many functions depend on `parsePTDate()` working correctly
- Must maintain existing behavior for valid dates
- Only change behavior for invalid inputs (from throwing error to returning null)
- Callers that assume valid dates may need null checks added

**Testing approach**:
- Verify all existing valid date scenarios still work
- Test with null, undefined, empty string, invalid format
- Check all call sites handle null return value appropriately

## Technology Stack Confirmation

- **dayjs**: Already in use, provides `.isValid()` method for validation
- **dayjs timezone plugin**: Already configured for Pacific Time
- **Existing date format**: YYYY-MM-DD (ISO date format) confirmed from sprints.json

## Integration Points

- **triageLogic.js**: `run5pmCheck()` calls `parsePTDate(currentSprint.endDate)` - needs null check
- **dataUtils.js**: `findCurrentSprint()` and `findNextSprint()` also use `parsePTDate()` - may need null checks
- **scheduleCommandHandler.js**: Uses `parsePTDate()` for sprint date comparisons
- **formatPTDate()**: Also constructs date strings similarly - may need similar validation

## Unresolved Questions

None - all technical decisions have been made. The fix is straightforward: enhance `parsePTDate()` with validation and update callers to handle null returns.

