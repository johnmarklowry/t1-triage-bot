## Context

The database implementation is experiencing duplicate key value errors due to several schema design issues and lack of proper error handling. The current constraints are too restrictive for the application's use cases, particularly around user discipline assignments and concurrent operations.

## Goals / Non-Goals

- Goals:
  - Fix database schema constraints to handle legitimate duplicate scenarios
  - Implement comprehensive error handling for database operations
  - Add retry logic for transient errors
  - Ensure data consistency without application failures
  - Maintain audit trails and data integrity
- Non-Goals:
  - Changing external API interfaces
  - Major schema redesign
  - Real-time replication or advanced clustering

## Decisions

- Decision: Use upsert operations (INSERT ... ON CONFLICT) for idempotent operations
- Alternatives considered: Pre-checking existence, separate INSERT/UPDATE operations
- Rationale: Upsert operations are atomic and handle race conditions better

- Decision: Implement retry logic with exponential backoff for transient errors
- Alternatives considered: Immediate failure, fixed delay retry
- Rationale: Exponential backoff reduces database load and handles temporary issues better

- Decision: Fix users table schema to allow same user in multiple disciplines
- Alternatives considered: Separate user_disciplines junction table, single discipline per user
- Rationale: Current business logic requires users to be in multiple disciplines, so schema must support this

## Risks / Trade-offs

- Risk: Increased complexity in error handling → Mitigation: Comprehensive testing and clear error messages
- Risk: Performance impact from retry logic → Mitigation: Configurable retry limits and monitoring
- Risk: Data inconsistency during concurrent operations → Mitigation: Proper transaction handling and validation

## Migration Plan

1. Create new migration script to fix existing duplicate data
2. Update database schema constraints to be more permissive
3. Implement upsert operations in repository layer
4. Add comprehensive error handling and retry logic
5. Update application layer to handle database errors gracefully
6. Test concurrent operations and edge cases
7. Deploy with monitoring and rollback capability

## Technical Implementation

### Database Schema Changes

```sql
-- Fix users table to allow same user in multiple disciplines
-- Remove UNIQUE constraint on slack_id, add composite unique constraint
ALTER TABLE users DROP CONSTRAINT users_slack_id_key;
ALTER TABLE users ADD CONSTRAINT users_slack_discipline_unique UNIQUE (slack_id, discipline);

-- Add proper indexes for performance
CREATE INDEX idx_users_slack_discipline ON users(slack_id, discipline);

-- Update sprints table to handle duplicate indexes better
-- Add partial unique index for active sprints
CREATE UNIQUE INDEX idx_sprints_active_unique ON sprints(sprint_index) 
WHERE sprint_index IS NOT NULL;

-- Update overrides table to prevent duplicate requests
ALTER TABLE overrides ADD CONSTRAINT overrides_unique_request 
UNIQUE (sprint_index, role, requested_by, replacement_slack_id);
```

### Repository Layer Updates

```javascript
// Example upsert operation for users
async addUser(slackId, name, discipline, changedBy = 'system') {
  return await transaction(async (client) => {
    const result = await client.query(`
      INSERT INTO users (slack_id, name, discipline)
      VALUES ($1, $2, $3)
      ON CONFLICT (slack_id, discipline) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [slackId, name, discipline]);
    
    // Audit logging...
    return result.rows[0].id;
  });
}
```

### Error Handling Strategy

```javascript
// Retry logic with exponential backoff
async function withRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (isRetryableError(error) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

## Open Questions

- Should we implement database-level deadlock detection and resolution?
- What is the optimal retry count and backoff strategy for our use case?
- Should we implement circuit breaker pattern for database operations?
- How should we handle audit logging during retry operations?
