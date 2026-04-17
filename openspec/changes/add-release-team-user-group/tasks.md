## 1. OpenSpec and Design

- [x] 1.1 Create proposal, tasks, and design artifacts for release team user group automation
- [x] 1.2 Add spec delta requirements for data model, scheduler, and Slack membership behavior
- [x] 1.3 Attempt strict OpenSpec validation (CLI not available in this environment)

## 2. Data Model and Repository

- [x] 2.1 Add `on_release_team` boolean to Prisma `User` model and generate migration SQL
- [x] 2.2 Update users repository read/write paths to include release-team flag in DB mode
- [x] 2.3 Support JSON fallback field parity (`onReleaseTeam`) when database mode is disabled

## 3. Admin Workflows

- [x] 3.1 Add release-team toggle controls in admin disciplines UI
- [x] 3.2 Persist release-team flag changes via admin command handlers (DB and JSON modes)
- [x] 3.3 Ensure add-member flow can set initial release-team flag

## 4. Release Team Automation

- [x] 4.1 Add release-team Slack updater(s) with staging-safe user group IDs and optional topic updates
- [x] 4.2 Add day-before-sprint PT predicate and release member computation from sprint `S`
- [x] 4.3 Add secured Railway cron route for release-team refresh and wire env/config docs
- [x] 4.4 Keep previous group membership when computed set is empty (warn + skip replace)

## 5. Tests

- [x] 5.1 Add unit tests for release membership computation and edge cases
- [x] 5.2 Add integration test coverage for release cron route and empty-set behavior
