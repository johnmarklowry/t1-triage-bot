# Quickstart: Improve Slack Home Tab

## Overview

This guide helps you quickly understand and test the improved Slack home tab implementation.

## Prerequisites

1. **Slack App Configuration**:
   - Slack app created in workspace
   - Bot token with `app_manage` scope
   - `app_home_opened` event subscribed
   - App installed in workspace

2. **Environment Variables**:
   - `SLACK_BOT_TOKEN`: Bot user OAuth token
   - `SLACK_SIGNING_SECRET`: Signing secret for request verification
   - `DATABASE_URL` (optional): PostgreSQL connection string
   - `USE_DATABASE`: 'true' or 'false' (default: 'true')

3. **Dependencies**:
   - Node.js 18+
   - @slack/bolt (already installed)
   - dayjs (already installed)
   - Database connection or JSON fallback data

## Quick Test

### 1. Start the Server

```bash
npm start
```

### 2. Open Home Tab in Slack

1. Open Slack in your workspace
2. Navigate to your app (under "Apps" in sidebar)
3. Click on "Home" tab
4. Verify the home tab displays correctly

### 3. Verify Current Implementation

**Current Behavior**:
- Displays "Welcome to the Triage Rotation App Home!" header
- Shows "View All Upcoming Sprints" button
- Displays current on-call rotation
- Displays next on-call rotation
- Displays discipline rotation lists

**Issues to Note**:
- Uses basic section blocks with long markdown text
- Lacks visual hierarchy
- No rich formatting or context blocks
- Synchronous data access (will break with async database)

## Testing the Improved Implementation

### 1. Test Async Data Loading

**Before** (Current - Will Break):
```javascript
const current = getCurrentOnCall();  // Synchronous
const next = getNextOnCall();        // Synchronous
```

**After** (Required):
```javascript
const current = await getCurrentOnCall();  // Async
const next = await getNextOnCall();        // Async
const disciplines = await readDisciplines(); // Async
```

**Test**: Verify home tab loads without errors when using async database.

### 2. Test Block Kit Improvements

**Visual Hierarchy**:
- Header blocks for section titles
- Context blocks for dates/metadata
- Section blocks with fields for compact display

**Test**: Open home tab and verify:
- Clear section headers
- Better organized information
- Improved readability

### 3. Test Error Handling

**Missing Data**:
- Current rotation is null → Shows "No active sprint found"
- Next rotation is null → Shows "No upcoming sprint scheduled"
- Disciplines empty → Shows "Discipline data unavailable"

**Test**: Temporarily break data and verify graceful error messages.

### 4. Test Interactive Elements

**Primary Button**:
- "View All Upcoming Sprints" button opens modal
- Verify modal displays correctly

**Future Enhancements** (Optional):
- Overflow menu for settings/refresh
- Quick action buttons for common tasks

## Manual Testing Checklist

- [ ] Home tab opens without errors
- [ ] Current rotation displays correctly
- [ ] Next rotation displays correctly
- [ ] Discipline lists display correctly
- [ ] "View All Upcoming Sprints" button works
- [ ] Modal opens and displays upcoming sprints
- [ ] Error handling works (test with missing data)
- [ ] Async data loading works (test with database)
- [ ] Fallback to JSON works (test with database disabled)
- [ ] Response time is under 3 seconds

## Test Routes

### View Home Tab Structure

```bash
curl http://localhost:3000/test/home-tab
```

**Response**: JSON representation of the home tab blocks with metadata including block count and data availability.

### Test with Different Data States

The test route supports multiple query parameters to test error handling scenarios:

```bash
# Test with empty data (all data sources unavailable)
curl http://localhost:3000/test/home-tab?state=empty

# Test with missing current rotation
curl http://localhost:3000/test/home-tab?state=no-current

# Test with missing next rotation
curl http://localhost:3000/test/home-tab?state=no-next

# Test with missing disciplines
curl http://localhost:3000/test/home-tab?state=no-disciplines
```

**Response Format**: Each test route returns:
- `state`: The test state parameter used
- `view`: Complete home view object with blocks
- `data`: Object indicating which data sources are available
- `blocks`: Array of Block Kit blocks
- `blockCount`: Total number of blocks (for validation against 50 block limit)

**Use Cases**:
- Validate Block Kit structure without opening Slack
- Test error handling and fallback views
- Verify block count stays under Slack's 50 block limit
- Preview home tab appearance with different data scenarios

## Development Workflow

### 1. Make Changes

Edit `appHome.js`:
- Update `buildHomeView()` function
- Add helper functions for building blocks
- Update `formatCurrentText()`, `formatNextText()`, `formatDisciplines()`

### 2. Test Locally

```bash
# Start server
npm start

# Open home tab in Slack
# Verify changes
```

### 3. Test Async Operations

```bash
# Enable database
USE_DATABASE=true npm start

# Disable database (test fallback)
USE_DATABASE=false npm start
```

### 4. Verify Block Kit Structure

Use Slack's Block Kit Builder to preview blocks:
https://app.slack.com/block-kit-builder

## Common Issues

### Issue: Home Tab Not Updating

**Cause**: Event handler not firing or errors in handler

**Solution**:
1. Check server logs for errors
2. Verify `app_home_opened` event is subscribed
3. Verify bot token has `app_manage` scope
4. Check event handler code for errors

### Issue: Data Not Loading

**Cause**: Async/await not used or database connection issues

**Solution**:
1. Verify all data access functions use `await`
2. Check database connection
3. Verify JSON fallback files exist
4. Check error logs

### Issue: Blocks Not Rendering

**Cause**: Invalid Block Kit structure

**Solution**:
1. Validate blocks using Block Kit Builder
2. Check for missing required fields
3. Verify block types are correct
4. Check for block count exceeding 50

### Issue: Response Time > 3 Seconds

**Cause**: Slow data loading or inefficient block generation

**Solution**:
1. Use Promise.all() for parallel data loading
2. Optimize database queries
3. Cache data if appropriate
4. Simplify block structure

## Next Steps

1. Review the implementation plan (`plan.md`)
2. Review research findings (`research.md`)
3. Review data model (`data-model.md`)
4. Generate implementation tasks (`/speckit.tasks`)
5. Begin implementation

## References

- [Slack App Home](https://api.slack.com/surfaces/tabs)
- [Slack Block Kit](https://api.slack.com/block-kit)
- [Slack Block Kit Builder](https://app.slack.com/block-kit-builder)
- [Slack App Guidelines](https://api.slack.com/docs/slack-apps-guidelines)

