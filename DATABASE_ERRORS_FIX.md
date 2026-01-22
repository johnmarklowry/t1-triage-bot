# Database Duplicate Key Errors Fix

This document outlines the comprehensive solution for fixing database duplicate key value errors in the Triage Rotation Bot.

## Problem Analysis

The database is experiencing duplicate key value errors due to several issues:

### 1. Users Table Issues
- **Problem**: `slack_id` has UNIQUE constraint, but users can be in multiple disciplines
- **Impact**: Users cannot be assigned to multiple disciplines (e.g., someone who is both UI and Backend engineer)
- **Error**: `duplicate key value violates unique constraint "users_slack_id_key"`

### 2. Sprints Table Issues
- **Problem**: `sprint_index` has UNIQUE constraint, but migration scripts can create duplicates
- **Impact**: Sprint creation fails during data migration or concurrent operations
- **Error**: `duplicate key value violates unique constraint "sprints_sprint_index_key"`

### 3. Current State Table Issues
- **Problem**: `unique_current_state` constraint limits to one record, but concurrent updates cause conflicts
- **Impact**: State updates fail during sprint transitions
- **Error**: `duplicate key value violates unique constraint "unique_current_state"`

### 4. Overrides Table Issues
- **Problem**: Multiple override requests for same sprint/role can create conflicts
- **Impact**: Override requests fail or create duplicates
- **Error**: Constraint violations during override creation

### 5. Race Conditions
- **Problem**: Concurrent operations during sprint transitions and user management
- **Impact**: Application failures and data inconsistency
- **Error**: Various constraint violations due to race conditions

## Solution Overview

### 1. Database Schema Fixes

#### Users Table Fix
```sql
-- Remove restrictive UNIQUE constraint on slack_id
ALTER TABLE users DROP CONSTRAINT users_slack_id_key;

-- Add composite unique constraint for slack_id + discipline
ALTER TABLE users ADD CONSTRAINT users_slack_discipline_unique 
UNIQUE (slack_id, discipline);

-- Add performance index
CREATE INDEX idx_users_slack_discipline ON users(slack_id, discipline);
```

#### Sprints Table Fix
```sql
-- Add partial unique index for active sprints only
CREATE UNIQUE INDEX idx_sprints_active_unique ON sprints(sprint_index) 
WHERE sprint_index IS NOT NULL;
```

#### Overrides Table Fix
```sql
-- Prevent duplicate override requests
ALTER TABLE overrides ADD CONSTRAINT overrides_unique_request 
UNIQUE (sprint_index, role, requested_by, replacement_slack_id);
```

### 2. Repository Layer Improvements

#### Upsert Operations
- Implement `INSERT ... ON CONFLICT` operations for idempotent operations
- Handle constraint violations gracefully without application failures
- Maintain data integrity and audit trails

#### Error Handling
- Comprehensive error handling for all database operations
- Graceful fallback to JSON operations when database fails
- Detailed error logging and monitoring

#### Retry Logic
- Implement retry logic with exponential backoff for transient errors
- Handle connection timeouts and lock contention
- Prevent application crashes from temporary database issues

### 3. Application Layer Updates

#### Validation
- Pre-operation validation to prevent constraint violations
- Data integrity checks before database commits
- User feedback for operation failures

#### Fallback Mechanisms
- Automatic fallback to JSON file operations for critical failures
- Administrator notifications for database issues
- Graceful degradation of functionality

## Implementation Plan

### Phase 1: Database Schema Updates
1. Create migration script to fix existing duplicate data
2. Update database constraints to be more permissive
3. Add proper indexes for performance
4. Test schema changes with existing data

### Phase 2: Repository Layer Updates
1. Implement upsert operations for all critical operations
2. Add comprehensive error handling and retry logic
3. Update audit logging for retry scenarios
4. Test concurrent operations and edge cases

### Phase 3: Application Layer Updates
1. Update dataUtils.js to handle database errors gracefully
2. Fix overrideHandler.js to prevent duplicate requests
3. Update triageLogic.js for concurrent state updates
4. Add user feedback for database operation failures

### Phase 4: Testing and Validation
1. Create comprehensive tests for duplicate key scenarios
2. Test concurrent operations and race conditions
3. Validate migration scripts with production data
4. Performance testing and monitoring setup

## Expected Outcomes

### Immediate Benefits
- ✅ Elimination of duplicate key value errors
- ✅ Proper handling of users in multiple disciplines
- ✅ Graceful handling of concurrent operations
- ✅ Improved application stability and reliability

### Long-term Benefits
- ✅ Better data consistency and integrity
- ✅ Improved error handling and user experience
- ✅ Comprehensive monitoring and alerting
- ✅ Foundation for future database improvements

## Monitoring and Alerting

### Error Monitoring
- Track database constraint violations
- Monitor retry operations and success rates
- Alert on critical database failures
- Performance metrics for database operations

### Health Checks
- Database connection health monitoring
- Operation success rate tracking
- Fallback mechanism activation alerts
- Data consistency validation

## Risk Mitigation

### Deployment Risks
- **Risk**: Schema changes break existing functionality
- **Mitigation**: Comprehensive testing and staged deployment

### Data Risks
- **Risk**: Migration scripts corrupt existing data
- **Mitigation**: Backup procedures and rollback capability

### Performance Risks
- **Risk**: Retry logic impacts performance
- **Mitigation**: Configurable retry limits and monitoring

This comprehensive fix addresses all identified duplicate key value errors while maintaining data integrity and improving application reliability.
