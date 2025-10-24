## Why

The triage bot currently allows users to see who's currently on call and when they'll next be on call, but there's no way for users to check who will be on call on a specific future date. This limits users' ability to plan ahead and coordinate coverage.

According to the TODO.md, this is the last remaining feature to complete the core triage bot functionality: "Let users call the triage bot to determine who will be on call on a certain date".

## What Changes

- Add `/triage-schedule` slash command that allows users to query who will be on call on a specific date
- Create a modal interface for date selection and display of scheduled on-call assignments
- Implement date-based rotation calculation logic to determine assignments for future dates
- Add validation for date inputs (past dates, invalid dates, etc.)
- Provide clear feedback when no assignments are found for the selected date

**BREAKING**: None - this is a new feature that doesn't modify existing functionality.

## Impact

- Affected specs: slash-commands
- Affected code: New file for slash command handler, updates to triageLogic.js for date-based calculations
- New files: slashCommandHandler.js (or extend existing command files)
