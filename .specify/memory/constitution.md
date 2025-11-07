<!--
Sync Impact Report:
Version: 0.0.0 → 1.0.0 (initial constitution)
Modified Principles: N/A (new constitution)
Added Sections: Core Principles (5 principles), Slack App Constraints, Development Workflow, Governance
Removed Sections: N/A
Templates Requiring Updates:
  ✅ plan-template.md - Constitution Check section updated with Slack-specific gates
  ✅ spec-template.md - No changes needed (already user-story focused)
  ✅ tasks-template.md - No changes needed (already maintainability-focused)
  ✅ agent-file-template.md - No changes needed (generic template)
Follow-up TODOs: None
-->

# Triage Rotation Bot Constitution

## Core Principles

### I. Slack API Compliance
All interactions with Slack MUST follow Slack's official API best practices and guidelines. The system MUST respect Slack API rate limits, use proper event handling patterns, implement secure token management, and follow Slack's design guidelines for user interactions. Messages MUST be concise, clear, and human-like. The system MUST handle Slack API failures gracefully with appropriate error messages and fallback behaviors.

**Rationale**: Compliance with Slack's API ensures reliability, prevents service disruption, and maintains compatibility with future Slack platform updates. Following Slack design guidelines improves user experience and reduces support burden.

### II. Code Maintainability
Code MUST be written to be easily understood and modified by any individual contributor. All modules MUST be well-documented with clear purpose statements, function-level JSDoc comments, and inline explanations for complex logic. File organization MUST follow consistent patterns (repository pattern for data access, modular design for features). Code MUST avoid unnecessary complexity; when complexity is required, it MUST be justified and documented. Variable and function names MUST be descriptive and follow project conventions.

**Rationale**: Maintainability ensures the system can evolve with changing requirements and allows any team member to contribute effectively without extensive onboarding or tribal knowledge.

### III. Error Handling & Resilience
The system MUST implement comprehensive error handling at all layers (Slack events, database operations, external API calls). All errors MUST be logged with sufficient context for debugging. The system MUST degrade gracefully when non-critical services are unavailable (e.g., continue operating with cached data if database is temporarily unavailable). Error messages presented to users MUST be clear and actionable. All async operations MUST handle promise rejections and timeouts appropriately.

**Rationale**: Robust error handling prevents system failures from cascading and ensures the triage rotation system remains operational even when dependencies experience issues. Clear error messages reduce support burden and improve user trust.

### IV. Security & Configuration Management
All sensitive credentials (Slack tokens, API keys, database connection strings) MUST be stored as environment variables and NEVER committed to version control. The system MUST use the principle of least privilege when requesting Slack permissions (OAuth scopes). All user input MUST be validated and sanitized before processing or storage. Database queries MUST use parameterized statements to prevent SQL injection. Configuration MUST be centralized in environment files with clear documentation in `.env.example`.

**Rationale**: Proper security practices protect user data and system integrity. Environment-based configuration enables secure deployment across different environments and prevents credential exposure.

### V. Documentation & Testing
All features MUST have clear documentation covering purpose, usage, and integration points. Code MUST be structured to enable testing of individual components. Critical paths (Slack event handlers, rotation logic, override workflows) MUST have validation mechanisms (test routes, manual testing procedures, or automated tests). Database schema changes MUST be documented with migration scripts. All environment variables MUST be documented in `.env.example` with descriptions.

**Rationale**: Documentation enables contributors to understand and extend the system efficiently. Testable architecture ensures reliability and reduces regression risk during changes.

## Slack App Constraints

The system MUST operate within Slack's platform constraints and best practices:

- **Rate Limits**: All Slack API calls MUST respect rate limits and implement exponential backoff for retries
- **Event Handling**: Slack event handlers MUST respond within 3 seconds; long-running operations MUST be deferred
- **Token Management**: Slack tokens MUST be refreshed appropriately and stored securely
- **User Experience**: Messages MUST be brief, actionable, and follow Slack's design guidelines
- **Permission Scoping**: OAuth scopes MUST be minimal; only request permissions actually required
- **Timezone Handling**: All date/time operations MUST use Pacific Time (America/Los_Angeles) timezone consistently

## Development Workflow

### Code Contribution
- All code changes MUST follow the existing project conventions (CommonJS modules, camelCase functions, snake_case database columns)
- New features SHOULD follow OpenSpec-driven development with change proposals when applicable
- Code reviews MUST verify compliance with constitution principles
- Commit messages SHOULD reference OpenSpec change IDs when applicable

### Testing & Validation
- Manual testing via Slack integration is the primary validation method
- Test routes (`/test`) MUST be available for debugging critical functionality
- Database migrations MUST be tested in a safe environment before production deployment
- Health check endpoints MUST be implemented for monitoring system status

### Deployment
- Configuration MUST be validated before deployment (all required environment variables present)
- Database migrations MUST be run as part of deployment process
- System MUST log startup status and connection health to database
- Graceful degradation MUST be tested (system behavior when database is unavailable)

## Governance

This constitution supersedes all other development practices and guidelines. All code contributions and architectural decisions MUST comply with these principles.

### Amendment Process
- Amendments to the constitution require documentation of the rationale and impact
- Version numbers follow semantic versioning (MAJOR.MINOR.PATCH):
  - **MAJOR**: Backward incompatible principle changes or removals
  - **MINOR**: New principles added or existing principles materially expanded
  - **PATCH**: Clarifications, wording improvements, or non-semantic refinements
- All amendments MUST update this governance section and the version metadata

### Compliance Review
- All pull requests and code reviews MUST verify compliance with constitution principles
- When complexity is introduced that violates simplicity principles, it MUST be justified in the Complexity Tracking section of implementation plans
- Constitution violations discovered during review MUST be addressed before merge

### Guidance Integration
- This constitution works in conjunction with OpenSpec workflow (`openspec/AGENTS.md`) for feature development
- Project-specific conventions are documented in `openspec/project.md`
- Runtime development guidance SHOULD reference this constitution for decision-making

**Version**: 1.0.0 | **Ratified**: 2025-11-06 | **Last Amended**: 2025-11-06
