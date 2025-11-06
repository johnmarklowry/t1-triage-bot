# Separation of Concerns - Project Organization

## Overview

The project has been reorganized to provide clear separation of concerns, making it easier to understand the purpose and responsibility of each component.

## Directory Structure

```
t1-triage-bot/
├── src/                    # Source code organized by concern
│   ├── handlers/          # Event and command handlers
│   │   ├── adminCommands.js
│   │   ├── botMentionHandler.js
│   │   ├── overrideHandler.js
│   │   └── scheduleCommandHandler.js
│   ├── services/          # Business logic and data operations
│   │   ├── dataUtils.js
│   │   ├── triageLogic.js
│   │   └── triageScheduler.js
│   ├── views/             # UI components and views
│   │   ├── appHome.js
│   │   └── overrideModal.js
│   └── utils/             # Utility functions
│       ├── commandUtils.js
│       └── slackNotifier.js
├── config/                # Configuration files
│   ├── sla-guidelines.json
│   └── env.example
├── db/                    # Database layer
│   ├── connection.js
│   ├── repository.js
│   ├── migrate.js
│   └── migrations/
├── scripts/               # Utility scripts
│   ├── testRoutes.js
│   └── testSystem.js
├── data/                  # Data files (JSON backups)
├── tests/                 # Test files
└── server.js              # Application entry point
```

## Separation of Concerns

### 1. Handlers (`src/handlers/`)
**Purpose**: Handle incoming Slack events and slash commands

- **adminCommands.js**: Admin slash commands for managing sprints and disciplines
- **botMentionHandler.js**: Handles @mentions of the bot for SLA assessment
- **overrideHandler.js**: Handles override request workflows
- **scheduleCommandHandler.js**: Handles `/triage-schedule` command for date-based queries

**Responsibilities**:
- Parse incoming Slack events/commands
- Validate user input
- Delegate business logic to services
- Format responses for Slack

### 2. Services (`src/services/`)
**Purpose**: Core business logic and data operations

- **dataUtils.js**: Centralized data access layer (database + JSON fallback)
- **triageLogic.js**: Core triage rotation logic and state management
- **triageScheduler.js**: Scheduled job configuration (cron jobs)

**Responsibilities**:
- Business logic implementation
- Data persistence and retrieval
- State management
- Scheduled task coordination

### 3. Views (`src/views/`)
**Purpose**: UI components and Slack interface rendering

- **appHome.js**: Slack app home view and Express receiver setup
- **overrideModal.js**: Override request modal UI builder

**Responsibilities**:
- Slack UI component rendering
- Modal and view construction
- Slack Bolt app initialization

### 4. Utils (`src/utils/`)
**Purpose**: Reusable utility functions

- **commandUtils.js**: Environment-specific command name utilities
- **slackNotifier.js**: Slack notification and messaging utilities

**Responsibilities**:
- Cross-cutting concerns
- Reusable helper functions
- External service integrations (Slack API)

### 5. Config (`config/`)
**Purpose**: Configuration files and constants

- **sla-guidelines.json**: SLA severity level definitions
- **env.example**: Environment variable template

**Responsibilities**:
- Static configuration data
- Environment templates

### 6. Database (`db/`)
**Purpose**: Database layer and migrations

- **connection.js**: Database connection management
- **repository.js**: Data access layer (repository pattern)
- **migrate.js**: Migration runner
- **migrations/**: SQL migration scripts

**Responsibilities**:
- Database connectivity
- Data access abstraction
- Schema management

### 7. Scripts (`scripts/`)
**Purpose**: Utility and test scripts

- **testRoutes.js**: Test endpoints for debugging
- **testSystem.js**: Testing utilities and simulation

**Responsibilities**:
- Development and testing tools
- Debug endpoints
- Test utilities

## Benefits of This Organization

1. **Clear Intent**: Each directory has a single, well-defined purpose
2. **Easy Navigation**: Developers can quickly find code by concern
3. **Maintainability**: Changes to one concern don't affect others
4. **Testability**: Services can be tested independently of handlers
5. **Scalability**: Easy to add new handlers, services, or utilities

## Import Patterns

### From Handlers
```javascript
// Import services for business logic
const { readSprints } = require('../services/dataUtils');

// Import views for UI components
const { slackApp } = require('../views/appHome');

// Import utils for utilities
const { getEnvironmentCommand } = require('../utils/commandUtils');
```

### From Services
```javascript
// Import database layer
const { UsersRepository } = require('../../db/repository');

// Import utilities
const { notifyUser } = require('../utils/slackNotifier');
```

### From Views
```javascript
// Import services for data
const { readCurrentState } = require('../services/dataUtils');
```

## Migration Notes

All file paths have been updated to reflect the new structure. Key changes:

- Handlers moved from root to `src/handlers/`
- Services moved from root to `src/services/`
- Views moved from root to `src/views/`
- Utils moved from root to `src/utils/`
- Config files moved to `config/`
- All `require()` statements updated to use new paths

## Next Steps

When adding new code:

1. **New slash command?** → Add to `src/handlers/`
2. **New business logic?** → Add to `src/services/`
3. **New UI component?** → Add to `src/views/`
4. **New utility function?** → Add to `src/utils/`
5. **New configuration?** → Add to `config/`

