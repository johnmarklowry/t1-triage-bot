# API Contracts

## Overview

This is a bug fix to internal date parsing functions. There are no external API contracts, but the internal function contracts are documented below.

## Function Contracts

### parsePTDate(dateStr: string | null | undefined): dayjs.Dayjs | null

**Preconditions**:
- Function is called with a date string, null, or undefined

**Postconditions**:
- If input is valid YYYY-MM-DD format: Returns dayjs object in Pacific Time at midnight
- If input is invalid: Returns null and logs warning

**Error Conditions**:
- No errors thrown (returns null instead)
- Warnings logged to console for invalid inputs

**Side Effects**:
- Console warning logged if input is invalid
- No admin notifications sent

### run5pmCheck(): Promise<void>

**Preconditions**:
- System is running and cron job is scheduled
- Sprint data is available (may have invalid dates)

**Postconditions**:
- If currentSprint.endDate is valid: Processes normally, sends notifications if needed
- If currentSprint.endDate is invalid: Skips gracefully, logs warning, no notifications

**Error Conditions**:
- No errors thrown for invalid date scenarios
- Only system-level errors (not data validation) trigger admin notifications

**Side Effects**:
- May send Slack notifications to users (if dates are valid)
- May log warnings (if dates are invalid)
- No admin error notifications for date validation failures

## Internal Function Contracts

### Enhanced parsePTDate() Validation

**Input Validation Contract**:
1. Check null/undefined/empty → return null
2. Check format (YYYY-MM-DD regex) → return null if invalid
3. Attempt parsing → return null if dayjs parsing fails
4. Return dayjs object if all checks pass

**Logging Contract**:
- Log level: console.warn (not console.error)
- Include: function name, invalid value, reason for failure
- Format: `[parsePTDate] Invalid date string: ${dateStr} (reason: ${reason})`



