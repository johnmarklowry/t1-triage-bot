-- Migration: 005_add_users_rotation_order.sql
-- Preserve discipline rotation order for web admin reorder (issue #1)

ALTER TABLE users ADD COLUMN IF NOT EXISTS rotation_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY discipline ORDER BY id) - 1 AS rn
  FROM users
)
UPDATE users u
SET rotation_order = r.rn
FROM ranked r
WHERE u.id = r.id;

CREATE INDEX IF NOT EXISTS idx_users_discipline_rotation_order ON users(discipline, rotation_order);

INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by, reason)
VALUES (
  'schema',
  0,
  'UPDATE',
  '{"users.rotation_order": null}',
  '{"users.rotation_order": "integer column with backfill"}',
  'system',
  'Added rotation_order for discipline participant reorder (issue #1)'
);
