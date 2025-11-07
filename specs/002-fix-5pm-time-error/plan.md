# Implementation Plan: Fix 5PM Check Time Error

**Branch**: `002-fix-5pm-time-error` | **Date**: 2025-11-06 | **Spec**: `/specs/002-fix-5pm-time-error/spec.md`
**Input**: Feature specification from `/specs/002-fix-5pm-time-error/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Fix the "Invalid time value" error in the 5PM check by enhancing `parsePTDate()` in dataUtils.js to handle invalid date formats gracefully. The error occurs when sprint data contains null, undefined, or malformed date strings. The `parsePTDate()` function currently constructs `${dateStr}T00:00:00` without validation, causing dayjs to throw "Invalid time value" errors. Fix by adding input validation and error handling in `parsePTDate()` itself, making it robust for all callers.

## Technical Context

**Language/Version**: Node.js 18+ (matches existing project runtime)  
**Primary Dependencies**: dayjs with timezone plugin (already in use), existing triageLogic.js and dataUtils.js modules  
**Storage**: N/A (bug fix, no storage changes)  
**Testing**: Manual testing via test routes (`/test-5pm-check`), verify error scenarios don't trigger admin notifications  
**Target Platform**: Node.js server environment (Glitch platform)  
**Project Type**: Single project (bug fix to existing Slack bot)  
**Performance Goals**: No performance impact - validation adds minimal overhead  
**Constraints**: Must maintain backward compatibility; must not break existing valid date processing; must follow existing error handling patterns  
**Scale/Scope**: Fix affects single scheduled job (5PM check); impacts admin channel error notifications

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with Triage Rotation Bot Constitution principles:

- **I. Slack API Compliance**: Does this feature interact with Slack APIs? If yes, verify rate limit handling, event response times (<3s), token management, and message clarity.
- **II. Code Maintainability**: Is the proposed code structure clear and well-documented? Are modules organized consistently? Is complexity justified and documented?
- **III. Error Handling & Resilience**: Are all error paths handled? Is graceful degradation implemented for dependencies? Are errors logged with context?
- **IV. Security & Configuration**: Are any new secrets/config values documented in `.env.example`? Is user input validated? Are database queries parameterized?
- **V. Documentation & Testing**: Is the feature documented? Are validation mechanisms (test routes, manual procedures) planned? Are migrations documented if schema changes?

**Compliance Status**: ✅ Compliant

- **I. Slack API Compliance**: ✅ No new Slack API interactions; error handling prevents unnecessary admin notifications
- **II. Code Maintainability**: ✅ Simple validation logic with clear error messages; follows existing code patterns
- **III. Error Handling & Resilience**: ✅ Adds proper error handling for date parsing; prevents crashes and reduces error notifications
- **IV. Security & Configuration**: ✅ No new configuration needed; uses existing date parsing functions
- **V. Documentation & Testing**: ✅ Test routes available for validation; error scenarios can be tested manually

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
triageLogic.js          # Main file to modify - run5pmCheck() function
dataUtils.js            # May enhance parsePTDate() function for better error handling
testRoutes.js           # Test route /test-5pm-check for validation
```

**Structure Decision**: This is a bug fix to existing files. No new files or directories needed. Changes will be made to:
- `triageLogic.js` - Add date validation in `run5pmCheck()` function (line ~136)
- `dataUtils.js` - Optionally enhance `parsePTDate()` to handle invalid dates gracefully (line ~47)

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - this is a straightforward bug fix that adds validation and error handling.
