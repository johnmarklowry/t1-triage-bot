# E2E tests (Playwright) — Slack bot staging

Playwright drives the **Slack web client** (app.slack.com) to validate the staging bot before promoting to production. The bot under test must be **deployed to staging** (e.g. Railway) so Slack can reach it.

## Prerequisites

- **Staging bot:** Deployed and reachable by Slack. Event Subscriptions / Interactivity Request URL must point to your staging URL (e.g. `https://your-staging.up.railway.app/slack/events`).
- **Staging workspace:** Teamone (or your staging workspace) with the bot installed and `-staging` slash commands registered.
- **Node:** Install dependencies with `npm install` (includes `@playwright/test`).

## Install browsers (first time)

```bash
npx playwright install chromium
```

(Optional: `npx playwright install` for all browsers.)

## Auth: one-time login and save state

Slack uses OAuth/SSO and often 2FA, so the recommended approach is to log in once and reuse the saved session:

1. Run the auth setup (opens a browser):

   ```bash
   npm run test:e2e:auth
   ```

2. In the browser, log in to your **staging** Slack workspace (complete 2FA if prompted).
3. When the app has loaded (URL contains `/client/`), the test saves the session to `tests/e2e/.auth/storageState.json` and exits.
4. Do **not** commit `.auth/`; it is gitignored.

Subsequent e2e runs use this state and skip login.

## Run e2e tests

After auth state exists:

```bash
npm run test:e2e
```

This runs the slack-e2e project (full smoke suite: App Home, slash commands, admin UIs, validation).

To confirm Playwright discovers tests without running them:

```bash
npm run test:e2e -- --list
```

Other commands:

- `npm run test:e2e:ui` — open Playwright UI for debugging.
- `npm run test:e2e:auth` — run only the auth setup again (e.g. after session expires).

## CI

- **Option A:** Run e2e only when a valid `storageState` is available. Store `tests/e2e/.auth/storageState.json` as a secret or artifact (from a one-time manual auth run or a dedicated test account), then in CI copy it into `tests/e2e/.auth/` before `npm run test:e2e`.
- **Option B:** Use a dedicated test account with `SLACK_E2E_EMAIL` and `SLACK_E2E_PASSWORD` and automate login in the auth setup (works only if 2FA is disabled or handled). See `.env.e2e.example` for optional env vars.

Gate the “promote to production” step on e2e success (e.g. run after deploy to staging).

## Env vars (optional)

See `.env.e2e.example` in the repo root. Useful for e2e:

- `SLACK_WORKSPACE_URL` — e.g. `https://your-team.slack.com`. Defaults to `https://app.slack.com` if unset.
- `SLACK_E2E_APP_HOME_URL` — direct URL to the bot’s App Home tab. If set, App Home tests (UAT-022, UAT-023) navigate here instead of using the sidebar. Staging example: `https://app.slack.com/client/T024FQAM2/D09NHUJN58V`.
- `SLACK_E2E_ADMIN_CHANNEL_ID` — channel ID (e.g. `C024FQAM8`) for the admin channel (e.g. lcom-triage-admin-staging). Required for UAT-011 and other admin-only tests so the test navigates there first.
- `SLACK_E2E_EMAIL` / `SLACK_E2E_PASSWORD` — only if you automate login in the auth setup (no 2FA or cookie export).

## Test scope

Current smoke suite (UAT-003, 004, 007, 008, 011, 015, 016, 018, 022, 023):

- **UAT-022:** App Home loads and shows key content (e.g. “Current On-Call”, “Triage”).
- **UAT-023:** Home tab “View All Upcoming Sprints” opens modal.
- **UAT-003:** `/triage-schedule-staging` opens the schedule modal.
- **UAT-004:** Schedule modal opens and is interactive (modal visible and has a button).
- **UAT-007:** `/triage-override-staging` opens the override request modal.
- **UAT-008:** Override modal validates missing input (submit without required fields shows validation).
- **UAT-011:** `/override-list-staging` opens the override list (admin channel; set `SLACK_E2E_ADMIN_CHANNEL_ID`).
- **UAT-015:** `/admin-sprints-staging` opens admin sprints UI (admin channel).
- **UAT-016:** `/admin-disciplines-staging` opens admin disciplines UI (admin channel).
- **UAT-018:** `/admin-users-staging` opens user management UI (admin channel).

Slack’s DOM can change; if selectors break, update `tests/e2e/slack/app-home.spec.js` (prefer `getByRole` and `getByText`). More scenarios from `UAT_STAGING.md` can be added under `tests/e2e/slack/`.
