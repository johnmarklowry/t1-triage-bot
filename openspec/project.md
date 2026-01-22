# Project Context

## Purpose

The Triage Rotation Bot is a Slack-based automation system that manages on-call rotations for Lexus.com development teams. It automates the assignment of team members to triage duty across different disciplines (Account, Producer, Product Owner, UI Engineering, Backend Engineering) based on sprint schedules, handles coverage override requests, and provides SLA assessment for bug triage.

**Key Goals:**
- Automate sprint-based rotation assignments
- Provide real-time on-call status and notifications
- Enable coverage override requests with approval workflow
- Assess ticket severity according to SLA guidelines
- Maintain audit trails and historical data

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js with Slack Bolt framework
- **Database**: PostgreSQL with pg-pool for connection management
- **Data Storage**: JSON files (legacy) + PostgreSQL (current)
- **Scheduling**: node-cron for automated daily checks
- **Date Handling**: dayjs with timezone support
- **External APIs**: Slack Web API, Google Sheets API, OpenAI API
- **Deployment**: Glitch platform

## Project Conventions

### Code Style
- Use CommonJS modules (`require`/`module.exports`)
- Camel case for variables and functions
- Pascal case for constructors
- Snake case for database columns
- Comprehensive error handling with try/catch blocks
- Detailed console logging with prefixed tags (e.g., `[SERVER]`, `[DB]`)
- JSDoc comments for function documentation

### Architecture Patterns
- **Repository Pattern**: Data access layer abstracts database operations
- **Modular Design**: Each major feature in separate files (triageLogic.js, overrideHandler.js, etc.)
- **Event-Driven**: Slack events trigger bot responses and state updates
- **Scheduled Jobs**: Cron-based automation for daily rotation checks
- **Dual-Write Strategy**: Database operations with JSON fallback during migration
- **Audit Logging**: All state changes tracked in database audit_logs table

### Testing Strategy
- Manual testing via Slack integration
- Test routes (`/test`) for debugging and validation
- Database migration validation scripts
- Health check endpoints for monitoring
- Fallback mechanisms for graceful degradation

### Git Workflow
- Main branch: `staging` (based on git status)
- Feature branches for new capabilities
- OpenSpec-driven development with change proposals
- Commit messages should reference OpenSpec change IDs when applicable

## Domain Context

**Lexus.com Development Teams:**
- **Account**: Business stakeholders and account management
- **Producer**: Project management and coordination
- **PO (Product Owner)**: Product management and requirements
- **UI Engineering**: Frontend development and user interface
- **BE Engineering**: Backend development and APIs

**Sprint-Based Rotations:**
- 2-week sprint cycles with defined start/end dates
- Team members rotate through triage duty based on sprint index
- Pacific Time (PT) timezone for all date calculations
- Fallback users defined for each discipline if rotation lists are empty

**SLA Guidelines:**
- 4 severity levels (1-4) with specific response/resolution times
- Critical issues (Level 1): <1 hour response, same-day resolution
- Business impact criteria for severity classification
- Automated severity assessment via bot mentions

## Important Constraints

- **Slack Integration**: Must work within Slack's API rate limits and webhook constraints
- **Timezone Handling**: All operations use Pacific Time (America/Los_Angeles)
- **Data Consistency**: Prevent duplicate user assignments across disciplines
- **Audit Requirements**: Complete audit trail for compliance and debugging
- **Backward Compatibility**: Maintain API compatibility during database migration
- **Graceful Degradation**: System must continue operating if database is unavailable
- **User Privacy**: Handle Slack user IDs securely, no PII storage

## External Dependencies

- **Slack Platform**: Bot token, app token, signing secret for authentication
- **PostgreSQL Database**: Primary data storage with connection pooling
- **Google Sheets API**: Optional integration for data export/reporting
- **OpenAI API**: Optional integration for enhanced SLA assessment
- **Glitch Platform**: Hosting and deployment environment
- **Environment Variables**: All configuration via .env file
