# Tasks: Improve Slack Home Tab - Agent 2 (Visual Improvements)

**Agent Assignment**: Agent 2 - Block Kit Visual Improvements  
**Dependencies**: Must wait for Agent 1 to complete Phase 2 (Foundational) before starting  
**Dependencies**: Must wait for Agent 1 to complete User Story 1 before starting visual improvements  
**Can Start**: After Agent 1 completes Phase 2 + User Story 1

**Focus**: Refactor home tab to use Block Kit best practices for better visual hierarchy, readability, and information organization. This includes using header blocks, context blocks, section blocks with fields, and improved formatting.

## Phase 1: Setup (Shared - Complete First)

- [ ] T001 Review current `buildHomeView()` implementation in appHome.js to understand existing structure
- [ ] T002 Review `formatCurrentText()`, `formatNextText()`, and `formatDisciplines()` functions in appHome.js
- [ ] T003 Review `getCurrentOnCall()` and `getNextOnCall()` functions in appHome.js to identify async conversion needs
- [ ] T004 Review `app_home_opened` event handler in appHome.js to understand current data loading pattern

## Phase 4: User Story 2 - Improve Visual Hierarchy with Block Kit Best Practices (Priority: P2)

**Goal**: Refactor home tab to use Block Kit best practices for better visual hierarchy, readability, and information organization. Use header blocks, context blocks, and section blocks with fields instead of long markdown text strings.

**Independent Test**: Home tab displays with improved visual hierarchy. Verify by opening the app home tab and confirming:
- Header blocks are used for section titles
- Context blocks display date metadata
- Section blocks use fields array for compact label-value pairs
- Information is easier to scan and read
- Visual separation between sections is clear

### Implementation for User Story 2

- [ ] T020 [P] [US2] Create `buildHeaderBlock()` helper function in appHome.js for generating header blocks with consistent styling
- [ ] T021 [P] [US2] Create `buildContextBlock()` helper function in appHome.js for generating context blocks with date/metadata information
- [ ] T022 [P] [US2] Refactor `formatCurrentText()` function in appHome.js to return Block Kit blocks instead of markdown text string
- [ ] T023 [P] [US2] Refactor `formatNextText()` function in appHome.js to return Block Kit blocks instead of markdown text string
- [ ] T024 [US2] Create `buildCurrentRotationBlocks()` function in appHome.js that uses header block, section block with fields for dates, context block for date range, and section blocks for user roles
- [ ] T025 [US2] Create `buildNextRotationBlocks()` function in appHome.js following same pattern as buildCurrentRotationBlocks
- [ ] T026 [US2] Refactor `buildHomeView()` function in appHome.js to use new block-building functions instead of text formatting functions
- [ ] T027 [US2] Update `buildHomeView()` function in appHome.js to use header block for main title instead of section block
- [ ] T028 [US2] Update current rotation section in `buildHomeView()` function in appHome.js to use section blocks with fields array for start/end dates
- [ ] T029 [US2] Add context block after current rotation section in `buildHomeView()` function in appHome.js to display formatted date range
- [ ] T030 [US2] Update next rotation section in `buildHomeView()` function in appHome.js to use section blocks with fields array for start/end dates
- [ ] T031 [US2] Add context block after next rotation section in `buildHomeView()` function in appHome.js to display formatted date range
- [ ] T032 [US2] Update user role display in rotation sections to use section blocks with fields or context elements for better formatting
- [ ] T033 [P] [US2] Refactor `formatDisciplines()` function in appHome.js to return Block Kit blocks instead of markdown text string
- [ ] T034 [US2] Update discipline lists section in `buildHomeView()` function in appHome.js to use header block and section blocks with fields
- [ ] T035 [US2] Add JSDoc comments to all new block-building helper functions in appHome.js documenting Block Kit structure and purpose
- [ ] T036 [US2] Verify total block count in `buildHomeView()` function in appHome.js does not exceed 50 blocks (Slack API limit)
- [ ] T037 [US2] Test home tab rendering in Slack to verify visual hierarchy improvements display correctly
- [ ] T038 [US2] Verify home tab is more scannable and readable compared to previous implementation

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - home tab loads async data correctly AND displays with improved visual hierarchy using Block Kit best practices ✅

## Notes

- This agent focuses on visual improvements and Block Kit best practices
- Must wait for Agent 1 to complete Phase 2 (async fixes) before starting
- Must wait for Agent 1 to complete User Story 1 before starting visual improvements
- Can work independently once dependencies are met
- Coordinate with Agent 3 if error handling needs affect visual improvements
- Focus on making the home tab more visually appealing and easier to scan



