-- Migration: 002_fix_duplicate_key_constraints.sql
-- Fix database constraints to handle legitimate duplicate scenarios

-- Fix users table to allow same user in multiple disciplines
-- Remove duplicate users with same slack_id + discipline, keeping only the most recent one
DELETE FROM users a
USING users b
WHERE a.id < b.id
AND a.slack_id = b.slack_id
AND a.discipline = b.discipline;

-- Remove restrictive UNIQUE constraint on slack_id
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_slack_id_key;

-- Add composite unique constraint for slack_id + discipline
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_slack_discipline_unique;
ALTER TABLE users ADD CONSTRAINT users_slack_discipline_unique 
UNIQUE (slack_id, discipline);

-- Add performance index for the new constraint
CREATE INDEX IF NOT EXISTS idx_users_slack_discipline ON users(slack_id, discipline);

-- Fix sprints table to handle duplicate indexes better
-- Remove duplicate sprints with same sprint_index, keeping only the most recent one
DELETE FROM sprints a
USING sprints b
WHERE a.id < b.id
AND a.sprint_index = b.sprint_index
AND a.sprint_index IS NOT NULL;

-- Remove the strict unique constraint on sprint_index
ALTER TABLE sprints DROP CONSTRAINT IF EXISTS sprints_sprint_index_key;

-- Add partial unique index for active sprints only (non-null sprint_index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sprints_active_unique ON sprints(sprint_index) 
WHERE sprint_index IS NOT NULL;

-- Fix overrides table to prevent duplicate requests
-- Remove duplicate override requests, keeping only the most recent one
DELETE FROM overrides a
USING overrides b
WHERE a.id < b.id
AND a.sprint_index = b.sprint_index
AND a.role = b.role
AND a.requested_by = b.requested_by
AND a.replacement_slack_id = b.replacement_slack_id;

-- Now add unique constraint to prevent duplicate override requests
ALTER TABLE overrides DROP CONSTRAINT IF EXISTS overrides_unique_request;
ALTER TABLE overrides ADD CONSTRAINT overrides_unique_request 
UNIQUE (sprint_index, role, requested_by, replacement_slack_id);

-- Add index for better performance on override lookups
CREATE INDEX IF NOT EXISTS idx_overrides_unique_lookup ON overrides(sprint_index, role, requested_by, replacement_slack_id);

-- Fix current_state table constraint handling
-- Remove any rows that don't have id = 1
DELETE FROM current_state WHERE id != 1;

-- Remove the restrictive CHECK constraint that limits to id = 1
ALTER TABLE current_state DROP CONSTRAINT IF EXISTS unique_current_state;

-- Add a proper unique constraint on the id field (should only have one record)
-- Note: id is already a PRIMARY KEY, so this is somewhat redundant but we keep it for clarity
ALTER TABLE current_state DROP CONSTRAINT IF EXISTS current_state_single_record;
ALTER TABLE current_state ADD CONSTRAINT current_state_single_record 
UNIQUE (id);

-- Ensure we have the initial current state record if it doesn't exist
INSERT INTO current_state (id, sprint_index) 
VALUES (1, NULL) 
ON CONFLICT (id) DO NOTHING;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_current_state_id ON current_state(id);

-- Add audit logging for this migration
INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by, reason)
VALUES ('schema', 0, 'UPDATE', 
        '{"constraints": ["users_slack_id_key", "sprints_sprint_index_key", "unique_current_state"]}',
        '{"constraints": ["users_slack_discipline_unique", "idx_sprints_active_unique", "current_state_single_record"]}',
        'system', 
        'Fixed duplicate key constraints to handle legitimate duplicate scenarios');
