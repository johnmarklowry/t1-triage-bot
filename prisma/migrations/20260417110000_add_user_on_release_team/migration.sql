-- Add a release-team participation flag to discipline roster rows.
-- This is used to filter computed sprint assignees for @release_team automation.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "on_release_team" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "idx_users_on_release_team" ON "users" ("on_release_team");
