## Why

The triage bot currently stores all data in local JSON files (`currentState.json`, `sprints.json`, `disciplines.json`, `overrides.json`). This approach has limitations:
- No transaction safety or concurrency control
- No audit trail for changes
- No historical data retention
- Limited query capabilities
- Risk of data corruption from concurrent writes
- Difficult to scale or add reporting features

Moving to PostgreSQL will provide:
- ACID transactions for data consistency
- Full audit trail of all rotations and changes
- Historical tracking for analytics
- Proper relational modeling
- Better support for future enhancements

## What Changes

- Add PostgreSQL database with schema for users, sprints, assignments, overrides, and audit logs
- Introduce database connection pooling and migration system
- Create a data access layer to abstract database operations
- Migrate existing JSON data to PostgreSQL tables
- Maintain backward compatibility during transition period
- Add comprehensive audit logging for all state changes
- Update all data operations to use database instead of JSON files

**BREAKING**: This changes the data persistence layer, but the API contracts remain the same. Migration scripts will handle data transfer.

## Impact

- Affected specs: data-persistence
- Affected code: dataUtils.js, triageLogic.js, overrideHandler.js, server.js, package.json
- New files: db/connection.js, db/migrations/, db/repository.js, db/migrate.js, .env.example
