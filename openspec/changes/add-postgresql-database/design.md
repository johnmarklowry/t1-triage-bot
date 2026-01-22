## Context

The triage bot currently uses JSON files for data persistence, which creates limitations around concurrency, audit trails, and scalability. This change introduces PostgreSQL as the primary data store while maintaining API compatibility.

## Goals / Non-Goals

- Goals: 
  - Replace JSON file storage with PostgreSQL
  - Maintain existing API contracts
  - Add comprehensive audit logging
  - Ensure data consistency with transactions
  - Enable historical tracking and analytics
- Non-Goals:
  - Changing external API interfaces
  - Real-time replication or clustering
  - Complex query optimization (initially)

## Decisions

- Decision: Use PostgreSQL with connection pooling
- Alternatives considered: SQLite (insufficient for concurrent access), MongoDB (overkill for relational data)
- Rationale: PostgreSQL provides ACID guarantees, excellent Node.js support, and handles concurrent access well

- Decision: Repository pattern for data access
- Alternatives considered: Direct SQL queries, ORM (Sequelize/TypeORM)
- Rationale: Repository pattern provides clean abstraction while keeping SQL visible and maintainable

- Decision: Dual-write migration strategy
- Alternatives considered: Big-bang migration, read-only migration
- Rationale: Dual-write allows gradual validation and rollback capability

## Risks / Trade-offs

- Risk: Data inconsistency during migration → Mitigation: Dual-write mode with validation
- Risk: Performance impact → Mitigation: Connection pooling and proper indexing
- Risk: Migration complexity → Mitigation: Comprehensive testing and rollback procedures

## Migration Plan

1. Create database schema and connection layer
2. Implement repository pattern with dual-write capability
3. Migrate existing JSON data to database
4. Validate operations match expected behavior
5. Switch to database-only mode
6. Remove JSON dependencies (keep as backup)

## Open Questions

- Should we implement database-level constraints for data integrity?
- What retention policy for audit logs?
- How to handle database connection failures gracefully?
