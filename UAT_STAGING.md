# UAT (Staging) — NATE Triage Team Bot (Teamone)

## Scope (excluding the new RCA feature)

- **Environment**: Staging
- **Slack workspace**: Teamone
- **Bot**: NATE Triage Team Bot
- **Channels**:
  - `lcom-triage-admin-staging`
  - `lcom-triage-staging`
- **Command suffix**: All slash commands use `-staging`
- **In scope**: Slack Home tab UX + modals/CTAs, environment-specific slash commands, triage schedule query, override request + admin management, admin commands/views (including user management), and general “no-crash” handling for Slack payload variants.
- **Out of scope**: Database connectivity validation and data correctness dependent on DB contents (this UAT validates **behavior + messaging**, even when data is unavailable).

**On-call user group:** Staging uses a separate Slack user group for on-call participants. Set `SLACK_USERGROUP_ID_STAGING` in the staging environment so rotation and on-call updates do not touch the production group. For rotation/on-call tests, this variable must be set. See ENVIRONMENT_COMMANDS.md (On-call user group) for setup.

---

## Test Accounts / Roles

| Role | Slack User | Channel Membership | Notes |
|---|---|---|---|
| Admin tester | TBD | Must be in `lcom-triage-admin-staging` | Can run admin commands + approve/deny overrides |
| Non-admin tester | TBD | Must NOT be in `lcom-triage-admin-staging` | Used to verify access controls |
| General user tester | TBD | In Teamone | Used for schedule queries + override requests |

---

## UAT Test Matrix (Confluence markdown table)

| ID | Area | Scenario | Preconditions | Steps | Expected Result | Actual Result | Pass/Fail | Notes / Follow-up |
|---|---|---|---|---|---|---|---|---|
| UAT-001 | Env commands | Staging commands are recognized with `-staging` | Bot installed in Teamone; commands registered | Run `/triage-schedule-staging`, `/triage-override-staging`, `/override-list-staging`, `/admin-sprints-staging`, `/admin-disciplines-staging`, `/admin-users-staging` | Each command is recognized and responds (modal/view opens) |  |  |  |
| UAT-002 | Env commands | Non-suffixed commands are not used in staging | Same as above | Try `/triage-schedule` (no suffix) | Slack shows unknown command (or bot does not handle it) |  |  |  |
| UAT-003 | Triage schedule | Command opens date-picker modal | Command registered | Run `/triage-schedule-staging` | Date selection modal opens |  |  |  |
| UAT-004 | Triage schedule | Past date validation | — | Select a past date and submit | Validation error shown; user can correct and re-submit |  |  |  |
| UAT-005 | Triage schedule | No assignments found handled gracefully | DB not required | Select a date where assignments aren’t available and submit | Modal shows “no assignments found/available” (no crash) |  |  |  |
| UAT-006 | Triage schedule | Valid future date shows assignments | JSON fallback ok | Select a future date and submit | Modal shows assignments per discipline (readable formatting) |  |  |  |
| UAT-007 | Overrides | User can open override request flow | Command registered | Run `/triage-override-staging` | Override request modal opens |  |  |  |
| UAT-008 | Overrides | Override form validates missing/invalid input | — | Submit with missing/invalid fields | Inline validation error; request not submitted |  |  |  |
| UAT-009 | Overrides | Successful override request yields confirmation | DB not required; behavior-focused | Submit a valid override request | User sees success confirmation (or “queued/pending”) |  |  |  |
| UAT-010 | Overrides | Duplicate request handled gracefully | Same user submits same request twice | Submit the same override twice | Second attempt is deduped/rejected with clear message (no crash) |  |  |  |
| UAT-011 | Override management | Admin override list opens | Admin tester in `lcom-triage-admin-staging` | Run `/override-list-staging` (from any channel) | Override list UI opens; items are readable |  |  |  |
| UAT-012 | Override management | Admin approve flow works | Pending override exists (or create via UAT-009) | Approve an override from list | Status updates to approved; admin sees confirmation |  |  |  |
| UAT-013 | Override management | Admin deny flow works | Pending override exists | Deny an override | Status updates to denied; admin sees confirmation |  |  |  |
| UAT-014 | Override management | Non-admin access blocked | Non-admin tester | Try `/override-list-staging` and/or attempt admin actions | Access denied; no privileged action succeeds |  |  |  |
| UAT-015 | Admin | Admin sprints UI renders | Admin tester in `lcom-triage-admin-staging` | Run `/admin-sprints-staging` | Admin UI opens and renders without errors |  |  |  |
| UAT-016 | Admin | Admin disciplines UI renders | Admin tester in `lcom-triage-admin-staging` | Run `/admin-disciplines-staging` | Admin UI opens and renders without errors |  |  |  |
| UAT-017 | Admin - Users | Access user management via Home tab CTA | Admin tester; App Home enabled | Open **NATE Triage Team Bot** → **Home** → click the **User Management** CTA | User Management screen opens |  |  |  |
| UAT-018 | Admin - Users | Access user management via admin channel command | Admin tester in `lcom-triage-admin-staging` | In `lcom-triage-admin-staging`, run `/admin-users-staging` | User Management screen opens |  |  |  |
| UAT-019 | Admin - Users | Discipline filter updates the member list | User Management screen open | Change **Discipline** dropdown | List updates to show members for that discipline |  |  |  |
| UAT-020 | Admin - Users | Remove from rotations works | User Management screen open; active member exists | Click **Remove from rotations** for a member | Member is removed from rotations; UI updates/reflects change |  |  |  |
| UAT-021 | Admin - Users | Deactivate works + inactive section behavior | User Management screen open; active member exists | Click **Deactivate** for a member; then view **Inactive members** (expand/show if needed) | Member becomes inactive; inactive list updates (or shows correct empty state) |  |  |  |
| UAT-022 | Home tab | Home tab loads cleanly | App Home enabled; bot installed | Open NATE Triage Team Bot → Home | Loads in <3s; no Slack errors; readable layout |  |  |  |
| UAT-023 | Home tab | “View All Upcoming Sprints” opens modal | Home tab loaded | Click “View All Upcoming Sprints” | Modal opens; content readable |  |  |  |
| UAT-024 | Home tab | Missing-data states don’t crash | Data may be empty/unavailable | Open Home tab during empty state | Friendly messages; no crash |  |  |  |
| UAT-025 | Modals | Select menus/options render reliably | — | Open modals and interact with selects | No “invalid payload” errors; options load |  |  |  |
| UAT-026 | Triage channel | Mention-based triage guidance works | Bot in `lcom-triage-staging` | In `lcom-triage-staging`, mention NATE Triage Team Bot with a sample ticket summary | Bot responds with severity/guidance |  |  |  |
| UAT-027 | Triage channel | Empty/unclear mention handled safely | — | Mention bot with minimal content | Bot prompts for more info or responds safely (no crash) |  |  |  |

---

## Issues / Unexpected Findings Log (Confluence markdown table)

| Date | UAT ID | Channel | Summary | Expected | Actual | Severity (Blocker/High/Med/Low) | Owner | Link (Jira/GH) | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |

