# Environment-Specific Slash Commands

This document describes the environment-specific slash command implementation for the Triage Rotation Bot.

## Overview

The bot now supports environment-specific slash commands to ensure uniqueness across different deployment environments (staging vs production). This prevents command conflicts when both environments are running simultaneously.

## Environment Detection

The system detects the environment using the following environment variables:

- `ENVIRONMENT=staging` - Primary staging environment indicator
- `APP_ENV=staging` - Alternative staging environment indicator

When either of these variables is set to `staging`, commands will append the `-staging` suffix.

## Command Naming

### Production Environment
When no staging environment variables are set, commands use their base names:

- `/triage-schedule`
- `/admin-sprints`
- `/admin-disciplines`
- `/triage-override`
- `/override-list`

### Staging Environment
When `ENVIRONMENT=staging` or `APP_ENV=staging` is set, commands append `-staging`:

- `/triage-schedule-staging`
- `/admin-sprints-staging`
- `/admin-disciplines-staging`
- `/triage-override-staging`
- `/override-list-staging`

## Implementation

### Command Utility (`commandUtils.js`)
Provides utility functions for generating environment-specific command names:

```javascript
const { getEnvironmentCommand } = require('./commandUtils');

// Usage in command handlers
slackApp.command(getEnvironmentCommand('triage-schedule'), async ({ command, ack, client, logger }) => {
  // Command handler logic
});
```

### Updated Files
- `commandUtils.js` - New utility for environment-specific naming
- `scheduleCommandHandler.js` - Updated to use environment-specific commands
- `adminCommands.js` - Updated to use environment-specific commands
- `overrideHandler.js` - Updated to use environment-specific commands

## Configuration

To configure the staging environment, set one of these environment variables:

```bash
# Option 1: Primary staging indicator
ENVIRONMENT=staging

# Option 2: Alternative staging indicator
APP_ENV=staging
```

## Benefits

1. **Unique Commands**: Prevents conflicts between staging and production environments
2. **Clear Distinction**: Users can easily identify which environment they're interacting with
3. **Flexible Configuration**: Supports multiple environment variable naming conventions
4. **Backward Compatible**: Production environment uses standard command names

## Testing

The environment-specific command system has been tested and validated:

- ✅ Commands work correctly in production mode (no staging env vars)
- ✅ Commands append `-staging` when staging environment variables are set
- ✅ Both `ENVIRONMENT=staging` and `APP_ENV=staging` are supported
- ✅ All existing slash commands have been updated
- ✅ OpenSpec proposal validates successfully

## Deployment Notes

When deploying to staging:
1. Set `ENVIRONMENT=staging` or `APP_ENV=staging` in your environment variables
2. Register the staging-specific slash commands in your Slack app configuration
3. Ensure users know to use the `-staging` suffixed commands

When deploying to production:
1. Ensure no staging environment variables are set
2. Register the standard slash commands in your Slack app configuration
3. Users can use the standard command names

## Railway Cron Scheduling

To ensure rotation notifications run on infrastructure-managed cron instead of the in-app scheduler:

1. **Create/Update Cron Job**  
   - In Railway, add a cron trigger targeting `POST /jobs/railway/notify-rotation`.  
   - Recommended schedule: `0 16 * * *` (8:00 AM PT daily). Adjust as needed for business hours.

2. **Set Secrets**  
   - Add `RAILWAY_CRON_SECRET` to the service variables.  
   - Share the value with the engineering team via the existing secret management workflow.

3. **Webhook Configuration**  
   - Configure the Railway cron job to include the secret in header `X-Railway-Cron-Signature`.  
   - Confirm the webhook URL includes the correct environment domain (staging vs production).

4. **Disable Legacy Scheduler**  
   - After verifying Railway cron, disable the `node-cron` job in `triageScheduler.js` (feature flag or removal).  
   - Document the cutover date and rollback plan in the release notes.
   - Set `ENABLE_IN_APP_CRON=true` only when explicitly testing the legacy scheduler.

5. **Verification**  
   - Use the quickstart guide in `specs/004-notification-updates/quickstart.md` to simulate cron invocations.  
   - Confirm `notification_snapshots` and `cron_trigger_audits` tables receive new entries per trigger.
