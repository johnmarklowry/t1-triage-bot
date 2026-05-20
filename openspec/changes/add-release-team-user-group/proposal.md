## Why

Teams in `lexus_releases` need the same ownership clarity as triage on-call. Today there is no automatically maintained Slack user group that reflects who is responsible for the upcoming release cycle.

The release team must update one Pacific calendar day before the next sprint begins, using the same sprint rotation/override logic while honoring an explicit per-user release-team flag.

## What Changes

- Add release-team Slack user group automation (`@release_team`) using Slack `usergroups.users.update` full membership replace.
- Add `on_release_team` boolean flag on `users` data model (default `false`) and expose it through repository + admin flows.
- Add daily Railway webhook/cron path that computes tomorrow-in-PT, finds sprint `S` whose `startDate` matches, and updates release group for sprint `S`.
- Keep previous release group membership when computed member set is empty (skip Slack update + warn logs).
- Add optional releases-channel topic update using computed release member mentions.
- Add staging-safe env split for release user group IDs to prevent staging from mutating production user groups.

## Impact

- Affected specs: `release-team-user-group`
- Affected code: `prisma/schema.prisma`, `prisma/migrations/*`, `db/repository.js`, `dataUtils.js`, `services/adminViews.js`, `adminCommands.js`, `slackNotifier.js`, `routes/railwayCron.js`, `railway.json`, `env.example`, `ENVIRONMENT_COMMANDS.md`
- New tests: unit tests for release membership computation and integration tests for release cron webhook behavior
