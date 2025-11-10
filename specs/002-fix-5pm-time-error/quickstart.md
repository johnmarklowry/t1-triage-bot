# Quickstart Guide: Fix 5PM Check Time Error

## Problem

The 5PM check is throwing "Invalid time value" errors when sprint data contains invalid date values. This causes error notifications to be sent to the admin channel.

## Root Cause

The `parsePTDate()` function in `dataUtils.js` doesn't validate input before parsing. When `endDate` is null, undefined, or an invalid format, it constructs invalid strings like `nullT00:00:00`, which dayjs cannot parse.

## Solution

Enhance `parsePTDate()` to validate input and return null for invalid dates instead of throwing errors. Update callers (especially `run5pmCheck()`) to handle null returns gracefully.

## Implementation Steps

### Step 1: Enhance parsePTDate() Function

Modify `dataUtils.js` function `parsePTDate()`:

```javascript
function parsePTDate(dateStr) {
  // Validate input
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') {
    console.warn(`[parsePTDate] Invalid date string: ${dateStr} (null, undefined, or empty)`);
    return null;
  }
  
  // Validate format (YYYY-MM-DD)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(dateStr)) {
    console.warn(`[parsePTDate] Invalid date format: ${dateStr} (expected YYYY-MM-DD)`);
    return null;
  }
  
  // Attempt parsing
  const parsed = dayjs.tz(`${dateStr}T00:00:00`, "America/Los_Angeles");
  if (!parsed.isValid()) {
    console.warn(`[parsePTDate] Invalid date value: ${dateStr} (dayjs parsing failed)`);
    return null;
  }
  
  return parsed;
}
```

### Step 2: Update run5pmCheck() to Handle Null

Modify `triageLogic.js` function `run5pmCheck()`:

```javascript
async function run5pmCheck() {
  try {
    const currentSprint = await findCurrentSprint();
    if (!currentSprint) {
      console.log("[5PM] No current sprint found for today.");
      return;
    }

    // Validate endDate before parsing
    if (!currentSprint.endDate) {
      console.warn("[5PM] Current sprint has no endDate, skipping check.");
      return;
    }

    const todayPT = getTodayPT();
    const sprintEndPT = parsePTDate(currentSprint.endDate);
    
    // Check if parsing succeeded
    if (!sprintEndPT) {
      console.warn(`[5PM] Invalid endDate for sprint ${currentSprint.sprintName}, skipping check.`);
      return;
    }

    // Rest of the logic...
  } catch (err) {
    console.error("[5PM Check] Error:", err);
    await notifyAdmins(`[5PM Check] Error: ${err.message}`);
  }
}
```

### Step 3: Test the Fix

1. **Test with valid dates**:
   ```bash
   # Use test route
   curl http://localhost:3000/test-5pm-check
   ```

2. **Test with invalid dates** (manually modify sprint data temporarily):
   - Set a sprint's endDate to null
   - Run 5PM check
   - Verify: No error, warning logged, no admin notification

3. **Verify admin channel**:
   - Check that no "Invalid time value" errors appear
   - Verify valid scenarios still work normally

## Testing Scenarios

### Scenario 1: Valid Date
- **Input**: `endDate = "2025-03-18"`
- **Expected**: Parses successfully, 5PM check runs normally

### Scenario 2: Null Date
- **Input**: `endDate = null`
- **Expected**: `parsePTDate()` returns null, warning logged, 5PM check skips gracefully

### Scenario 3: Undefined Date
- **Input**: `endDate = undefined`
- **Expected**: `parsePTDate()` returns null, warning logged, 5PM check skips gracefully

### Scenario 4: Invalid Format
- **Input**: `endDate = "invalid"`
- **Expected**: `parsePTDate()` returns null, warning logged, 5PM check skips gracefully

### Scenario 5: Empty String
- **Input**: `endDate = ""`
- **Expected**: `parsePTDate()` returns null, warning logged, 5PM check skips gracefully

## Verification

After implementing the fix:

1. ✅ No "Invalid time value" errors in logs
2. ✅ No admin channel error notifications for invalid dates
3. ✅ Valid date scenarios continue to work
4. ✅ Warnings logged for invalid dates (for debugging)
5. ✅ 5PM check completes without crashing

## Rollback Plan

If issues occur:
1. Revert changes to `parsePTDate()` in `dataUtils.js`
2. Revert changes to `run5pmCheck()` in `triageLogic.js`
3. Investigate root cause of invalid dates in sprint data

## Related Files

- `dataUtils.js` - `parsePTDate()` function (line ~47)
- `triageLogic.js` - `run5pmCheck()` function (line ~124)
- `testRoutes.js` - Test route `/test-5pm-check` for validation



