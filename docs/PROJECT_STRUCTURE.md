# Project Structure

This document describes the organization of the Triage Rotation Bot project.

## Directory Structure

```
t1-triage-bot/
├── docs/                          # Documentation files
│   ├── DATABASE_*.md             # Database-related documentation
│   ├── ENVIRONMENT_COMMANDS.md   # Environment-specific commands guide
│   ├── PR_*.md                   # Pull request documentation
│   ├── TODO.md                   # Project TODO list
│   └── PROJECT_STRUCTURE.md      # This file
│
├── scripts/                       # Utility scripts
│   ├── clear-users.js            # User management scripts
│   ├── debug-split.js            # Debug utilities
│   ├── testRoutes.js             # Test routes
│   └── testSystem.js             # System tests
│
├── tests/                         # Test files
│   ├── test-*.js                 # Various test files
│   └── ...
│
├── data/                          # JSON data files (legacy/backup)
│   ├── currentState.json.bak     # Backup files
│   ├── disciplines.json          # Discipline data
│   ├── disciplines.staging.json  # Staging-specific disciplines
│   ├── overrides.json            # Override data
│   └── sprints.json              # Sprint data
│
├── db/                            # Database layer
│   ├── connection.js             # Database connection
│   ├── migrate.js                # Migration runner
│   ├── migrate-json-data.js      # JSON to DB migration
│   ├── repository.js             # Data access layer
│   ├── repository-improved.js    # Enhanced repository (reference)
│   ├── migrations/               # SQL migration files
│   │   ├── 001_initial_schema.sql
│   │   └── 002_fix_duplicate_key_constraints.sql
│   └── scripts/                  # Database utility scripts
│       ├── migrate-fix-constraints.js
│       ├── remove-test-users.js
│       ├── seed-staging-users.js
│       └── test-duplicate-key-fixes.js
│
├── openspec/                      # OpenSpec documentation
│   ├── AGENTS.md                 # OpenSpec agent instructions
│   ├── project.md                # Project specifications
│   └── changes/                  # Change proposals
│       └── ...
│
├── adminCommands.js              # Admin slash commands
├── appHome.js                    # App home view
├── botMentionHandler.js          # Bot mention handling
├── commandUtils.js               # Command utilities
├── dataUtils.js                  # Data utilities
├── overrideHandler.js            # Override request handling
├── overrideModal.js              # Override modal UI
├── scheduleCommandHandler.js     # Schedule command handler
├── server.js                     # Main server file
├── setup-database.js             # Database setup script
├── slackNotifier.js              # Slack notifications
├── triageLogic.js                # Triage rotation logic
├── triageScheduler.js            # Scheduled tasks
├── sla-guidelines.json           # SLA guidelines
├── package.json                  # Node.js dependencies
└── railway.json                  # Railway deployment config
```

## Key Directories

### `/docs`
All project documentation including:
- Database setup and migration guides
- Environment configuration
- Pull request documentation
- Project TODO list

### `/scripts`
Utility scripts for:
- Testing and debugging
- User management
- System administration

### `/tests`
Test files for:
- Database operations
- Command handlers
- System integration

### `/data`
Legacy JSON data files (kept for backup/compatibility):
- User disciplines
- Sprint schedules
- Override requests
- Current state backups

### `/db`
Database layer including:
- Connection management
- Repository pattern implementation
- Migration scripts
- Database utility scripts

### `/db/scripts`
Database utility scripts:
- `migrate-fix-constraints.js` - Apply database constraint fixes
- `test-duplicate-key-fixes.js` - Test database fixes
- `seed-staging-users.js` - Seed staging database
- `remove-test-users.js` - Clean up test data

## NPM Scripts

```bash
# Start the application
npm start

# Database migrations
npm run migrate              # Run database migrations
npm run migrate-data         # Migrate JSON data to database
npm run db-status            # Check migration status

# Database utilities
npm run db:fix-constraints   # Apply constraint fixes
npm run db:test-fixes        # Test database fixes
npm run db:seed-staging      # Seed staging database
npm run db:clean-staging     # Clean staging database
```

## File Organization Principles

1. **Documentation**: All `.md` files go in `/docs`
2. **Scripts**: Utility scripts go in `/scripts`
3. **Tests**: Test files go in `/tests`
4. **Data**: JSON data files go in `/data`
5. **Database**: Database-related code in `/db`
6. **Source Code**: Main application files in root directory

## Migration Notes

When moving files:
- Update import paths in files that reference moved files
- Update package.json scripts if needed
- Update documentation references
- Test that all paths work correctly

## Best Practices

1. **Keep root directory clean**: Only essential application files
2. **Organize by purpose**: Group related files together
3. **Document changes**: Update this file when structure changes
4. **Use consistent naming**: Follow existing conventions
5. **Version control**: Keep `.gitignore` updated for new directories
