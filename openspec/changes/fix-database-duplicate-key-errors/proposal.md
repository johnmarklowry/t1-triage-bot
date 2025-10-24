## Why

The database is throwing duplicate key value errors due to several constraint violations and race conditions in the current implementation:

1. **Users table**: `slack_id` has a UNIQUE constraint, but users can be added to multiple disciplines, causing conflicts when the same user is assigned to different roles
2. **Sprints table**: `sprint_index` has a UNIQUE constraint, but migration scripts and concurrent operations can create duplicate entries
3. **Current state table**: The `unique_current_state` constraint limits to one record, but concurrent updates can cause conflicts
4. **Overrides table**: Multiple override requests for the same sprint/role combination can create conflicts
5. **Race conditions**: Concurrent operations during sprint transitions and user management can violate constraints

These errors cause the application to fail silently or crash, leading to data inconsistency and poor user experience.

## What Changes

- Fix database schema constraints to handle legitimate duplicate scenarios
- Implement proper error handling for constraint violations with graceful fallbacks
- Add upsert operations (INSERT ... ON CONFLICT) for idempotent operations
- Implement retry logic for transient constraint violations
- Add proper validation before database operations to prevent constraint violations
- Update migration scripts to handle existing duplicate data
- Add comprehensive error logging and monitoring for database operations

**BREAKING**: None - this fixes existing issues without changing API contracts.

## Impact

- Affected specs: data-persistence
- Affected code: db/repository.js, db/migrations/, dataUtils.js, overrideHandler.js
- Database schema updates to handle constraint violations gracefully
- Improved error handling and user feedback for database operations
