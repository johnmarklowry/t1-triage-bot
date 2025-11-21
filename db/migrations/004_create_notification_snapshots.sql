-- Migration: Create notification snapshot and cron audit tables
-- Purpose: Support Railway-driven notification workflow with persistence and auditing

-- Up -----------------------------------------------------------------------

-- Create cron_trigger_audits table first (referenced by notification_snapshots)
CREATE TABLE IF NOT EXISTS cron_trigger_audits (
  id UUID PRIMARY KEY,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scheduled_at TIMESTAMPTZ,
  result TEXT NOT NULL CHECK (result IN ('delivered', 'skipped', 'deferred', 'error', 'pending')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_snapshots (
  id SERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discipline_assignments JSONB NOT NULL,
  hash TEXT NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('delivered', 'skipped', 'deferred')),
  delivery_reason TEXT,
  railway_trigger_id UUID REFERENCES cron_trigger_audits(id) ON DELETE SET NULL,
  next_delivery TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_snapshots_hash
  ON notification_snapshots (hash);

CREATE INDEX IF NOT EXISTS idx_notification_snapshots_status
  ON notification_snapshots (delivery_status);

CREATE INDEX IF NOT EXISTS idx_cron_trigger_audits_triggered_at
  ON cron_trigger_audits (triggered_at DESC);

-- Down ---------------------------------------------------------------------

DROP TABLE IF EXISTS notification_snapshots;
DROP TABLE IF EXISTS cron_trigger_audits;

