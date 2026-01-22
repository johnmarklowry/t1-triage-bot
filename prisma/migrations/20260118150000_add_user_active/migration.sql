-- Add an "active" flag to users so admins can remove people from rotations
-- without deleting them from the system.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "idx_users_active" ON "users" ("active");

