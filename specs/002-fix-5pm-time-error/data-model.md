# Data Model

## Overview

This is a bug fix that enhances date parsing functions. There are no new data entities, but the existing date parsing logic needs to handle edge cases better.

## Function Signatures

### parsePTDate(dateStr)

**Current Behavior**: 
- Takes a date string, constructs `${dateStr}T00:00:00`, and parses with dayjs.tz()
- Throws "Invalid time value" error if dateStr is null, undefined, or invalid format

**Updated Behavior**:
- Validates input before parsing
- Returns null for invalid inputs (instead of throwing)
- Logs warnings for invalid inputs
- Returns dayjs object for valid inputs

**Input Validation Rules**:
- Must be non-null, non-undefined, non-empty string
- Must match YYYY-MM-DD format pattern
- Must be parseable by dayjs.tz()

**Return Value**:
- Valid date: dayjs object (timezone: America/Los_Angeles, time: 00:00:00)
- Invalid date: null

**Error Handling**:
- Logs warning with context (function name, invalid value)
- Does not throw errors
- Does not send admin notifications

## Caller Impact

### Functions That Call parsePTDate()

1. **triageLogic.js - run5pmCheck()**
   - Current: Assumes `currentSprint.endDate` is valid
   - Updated: Must check for null return value before using

2. **dataUtils.js - findCurrentSprint()**
   - Current: Calls `parsePTDate(startDate)` and `parsePTDate(endDate)`
   - Updated: Should handle null returns gracefully (skip invalid sprints)

3. **dataUtils.js - findNextSprint()**
   - Current: Calls `parsePTDate(startDate)` and `parsePTDate(endDate)`
   - Updated: Should handle null returns gracefully

4. **scheduleCommandHandler.js**
   - Current: Uses `parsePTDate()` for date comparisons
   - Updated: Should handle null returns

5. **formatPTDate()**
   - Note: Also constructs date strings similarly - may need similar validation

## Data Flow

### Sprint Data Structure

```javascript
{
  sprintName: string,
  startDate: string,  // Expected: "YYYY-MM-DD" format
  endDate: string     // Expected: "YYYY-MM-DD" format, may be null/undefined/invalid
}
```

### Error Scenarios

1. **null endDate**: `parsePTDate(null)` → returns null, logs warning
2. **undefined endDate**: `parsePTDate(undefined)` → returns null, logs warning
3. **empty string**: `parsePTDate("")` → returns null, logs warning
4. **invalid format**: `parsePTDate("invalid")` → returns null, logs warning
5. **valid date**: `parsePTDate("2025-03-18")` → returns dayjs object

## State Transitions

### Before Fix
- Invalid date → parsePTDate() throws error → run5pmCheck() catches → sends admin notification

### After Fix
- Invalid date → parsePTDate() returns null + logs warning → run5pmCheck() checks null → skips gracefully → no admin notification

## Validation Rules

- Date strings must be in YYYY-MM-DD format
- Date strings must be non-empty
- Date strings must be parseable by dayjs
- Callers must check for null return values
- Invalid dates should result in graceful degradation, not errors



