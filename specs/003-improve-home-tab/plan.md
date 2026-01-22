# Implementation Plan: Improve Slack Home Tab with Block Kit Best Practices

**Branch**: `003-improve-home-tab` | **Date**: 2025-01-XX | **Spec**: `/specs/003-improve-home-tab/spec.md`
**Input**: Feature specification from `/specs/003-improve-home-tab/spec.md`

## Summary

Enhance the Slack App Home tab to provide greater value to users by following Block Kit best practices. The current implementation uses basic section blocks with markdown text, but lacks visual hierarchy, rich formatting, contextual blocks, and interactive elements that would improve user experience. This improvement will make the home tab more engaging, informative, and actionable while maintaining compliance with Slack API constraints and performance requirements.

## Technical Context

**Language/Version**: Node.js 18+  
**Primary Dependencies**: @slack/bolt, dayjs  
**Storage**: PostgreSQL (via dataUtils.js) with JSON fallback  
**Testing**: Manual testing via Slack integration, test routes in testRoutes.js  
**Target Platform**: Slack App Home tab (web/mobile Slack clients)  
**Project Type**: single (Slack bot application)  
**Performance Goals**: Home tab must render within 3 seconds (Slack API requirement)  
**Constraints**: 
- Must respond to `app_home_opened` event within 3 seconds
- Block Kit has maximum of 50 blocks per view
- Must respect Slack API rate limits
- Must handle async data loading from database gracefully
**Scale/Scope**: Single Slack workspace, ~50 users, home tab viewed by all users on rotation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with Triage Rotation Bot Constitution principles:

- **I. Slack API Compliance**: ✅ YES - This feature directly interacts with Slack's App Home API. Must verify:
  - Rate limit handling for `views.publish` calls
  - Event response times (<3s) for `app_home_opened` handler
  - Token management (already handled by @slack/bolt)
  - Message clarity and conciseness in Block Kit blocks
- **II. Code Maintainability**: ✅ YES - Code structure should remain clear:
  - Refactor `buildHomeView()` function with better organization
  - Add JSDoc comments for Block Kit block builders
  - Maintain modular design (separate functions for different sections)
  - Document Block Kit design decisions
- **III. Error Handling & Resilience**: ✅ YES - Must handle:
  - Database/async operation failures gracefully
  - Missing data (null sprints, disciplines) with appropriate fallbacks
  - Slack API errors with logging and user-friendly messages
  - Degraded experience when data unavailable
- **IV. Security & Configuration**: ✅ YES - Verify:
  - No new secrets/config values needed (uses existing SLACK_BOT_TOKEN)
  - User input validation if adding interactive elements
  - Database queries already parameterized via repository layer
- **V. Documentation & Testing**: ✅ YES - Must include:
  - Documentation of Block Kit patterns used
  - Test route for home tab rendering (`/test/home-tab`)
  - Manual testing procedures in Slack
  - No database schema changes expected

**Compliance Status**: ✅ Compliant

## Project Structure

### Documentation (this feature)

```text
specs/003-improve-home-tab/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
appHome.js               # Main file - contains buildHomeView() and related functions
dataUtils.js             # Data access layer (already exists)
testRoutes.js            # Test routes for validation (already exists)
```

**Structure Decision**: Single file refactoring approach. The home tab logic is contained in `appHome.js`. We will enhance the existing `buildHomeView()` function and related helper functions (`formatCurrentText`, `formatNextText`, `formatDisciplines`) without requiring new modules, maintaining the current project structure.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations identified.

## Phase 0: Outline & Research

### Research Tasks

1. **Research Slack Block Kit Best Practices for Home Tab**
   - Decision: Which Block Kit blocks provide best visual hierarchy?
   - Rationale: Current implementation uses only section blocks. Need to explore context blocks, header blocks, divider blocks, and rich formatting options.
   - Alternatives: Consider using fields in section blocks, accessory elements, or context blocks for metadata

2. **Research Block Kit Layout Patterns for Information Display**
   - Decision: How to structure current/next sprint information for better readability?
   - Rationale: Current implementation uses long markdown text strings. Block Kit offers better layout options.
   - Alternatives: Compare single section blocks vs. multiple section blocks with fields vs. context blocks for dates

3. **Research Interactive Elements Best Practices**
   - Decision: What interactive elements (buttons, selects) add value without overwhelming users?
   - Rationale: Current implementation has one button. Need to understand when additional interactivity is appropriate.
   - Alternatives: Evaluate button groups, overflow menus, date pickers, user selects

4. **Research Slack Home Tab Design Patterns**
   - Decision: What information hierarchy and organization patterns work best?
   - Rationale: Need to prioritize content and organize it effectively.
   - Alternatives: Consider tabs/sections, collapsible sections, progressive disclosure

5. **Research Async Data Loading Patterns for Home Tab**
   - Decision: How to handle async data loading while maintaining <3s response time?
   - Rationale: Current implementation uses synchronous data access. Database operations are async.
   - Alternatives: Pre-load data, cache data, use loading states, optimize queries

## Phase 1: Design & Contracts

### Data Model

**Entities**:
- **HomeTabView**: Represents the complete home tab view structure
  - `currentRotation`: CurrentOnCall object (nullable)
  - `nextRotation`: NextOnCall object (nullable)
  - `disciplines`: Disciplines object
  - `upcomingSprints`: Array of Sprint objects (for quick preview)
- **CurrentOnCall**: Current sprint rotation information
  - `sprintName`: string
  - `startDate`: string (YYYY-MM-DD)
  - `endDate`: string (YYYY-MM-DD)
  - `users`: Array of UserRole objects
- **NextOnCall**: Next sprint rotation information (same structure as CurrentOnCall)
- **UserRole**: User information for a role
  - `role`: string (account, producer, po, uiEng, beEng)
  - `name`: string
  - `slackId`: string
- **BlockKitBlock**: Individual Block Kit block structure
  - Follows Slack Block Kit API specification

**State Transitions**: None - home tab is read-only display

**Validation Rules**:
- All date strings must be in YYYY-MM-DD format
- All slackId values must be valid Slack user IDs
- Role values must be one of: account, producer, po, uiEng, beEng
- Block arrays must not exceed 50 blocks

### API Contracts

**Home Tab API** (Slack Platform):
- **Endpoint**: `views.publish` (Slack Web API)
- **Method**: POST
- **Request**: 
  ```typescript
  {
    user_id: string;
    view: {
      type: 'home';
      blocks: BlockKitBlock[];
      callback_id?: string;
    }
  }
  ```
- **Response**: Standard Slack API response
- **Rate Limits**: Tier 3 (50+ per minute per workspace)

**Event Handler**:
- **Event**: `app_home_opened`
- **Handler**: `async ({ event, client, logger }) => void`
- **Constraints**: Must respond within 3 seconds
- **Error Handling**: Log errors, publish fallback view if needed

### Quickstart Guide

1. **Prerequisites**: 
   - Slack app configured with `app_home_opened` event subscription
   - Bot token with `app_manage` scope
   - Database connection or JSON fallback available

2. **Testing the Home Tab**:
   - Open Slack app in workspace
   - Navigate to "Home" tab
   - Verify current rotation displays correctly
   - Verify next rotation displays correctly
   - Verify discipline lists display correctly
   - Test interactive elements (buttons, modals)

3. **Manual Testing**:
   - Use `/test/home-tab` route to preview home tab structure
   - Verify async data loading handles gracefully
   - Test with missing data (null sprints, empty disciplines)
   - Test with database unavailable (should fallback to JSON)

## Phase 2: Implementation Planning

*Note: Tasks will be generated by `/speckit.tasks` command*

Key implementation areas:
1. Refactor `buildHomeView()` to use Block Kit best practices
2. Enhance visual hierarchy with header blocks, context blocks, and improved formatting
3. Improve information display with fields, accessory elements, and rich formatting
4. Add interactive elements where appropriate (buttons, selects, modals)
5. Handle async data loading properly
6. Add error handling and fallback views
7. Create test route for validation
8. Update documentation

---

**Next Steps**: 
1. Complete Phase 0 research (generate `research.md`)
2. Complete Phase 1 design artifacts (generate `data-model.md`, `contracts/`, `quickstart.md`)
3. Run `/speckit.tasks` to generate implementation tasks
4. Begin implementation
