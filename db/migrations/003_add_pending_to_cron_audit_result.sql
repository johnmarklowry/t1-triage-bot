-- Migration: 003_add_pending_to_cron_audit_result.sql
-- Purpose: Add 'pending' as a valid result value for cron_trigger_audits table
-- This migration handles the case where migration 004 has already been run
-- and the table exists with the old constraint that doesn't include 'pending'

-- If the table exists, we need to drop and recreate the constraint
-- PostgreSQL doesn't support direct ALTER of CHECK constraints, so we:
-- 1. Find and drop the existing constraint (if it exists)
-- 2. Add a new constraint with 'pending' included

DO $$
DECLARE
  constraint_name_var TEXT;
BEGIN
  -- Check if the table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'cron_trigger_audits'
  ) THEN
    -- Find the CHECK constraint on the result column
    SELECT tc.constraint_name INTO constraint_name_var
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'cron_trigger_audits'
      AND tc.constraint_type = 'CHECK'
      AND ccu.column_name = 'result'
    LIMIT 1;
    
    -- Drop the existing constraint if found
    IF constraint_name_var IS NOT NULL THEN
      EXECUTE 'ALTER TABLE cron_trigger_audits DROP CONSTRAINT ' || quote_ident(constraint_name_var);
    END IF;
    
    -- Add the new constraint with 'pending' included
    ALTER TABLE cron_trigger_audits
      ADD CONSTRAINT cron_trigger_audits_result_check 
      CHECK (result IN ('delivered', 'skipped', 'deferred', 'error', 'pending'));
  END IF;
END $$;

