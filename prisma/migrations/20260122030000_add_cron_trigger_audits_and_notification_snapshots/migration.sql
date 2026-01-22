-- Ensure UUID generation is available for uuid primary keys
-- gen_random_uuid() requires pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable: cron_trigger_audits
CREATE TABLE IF NOT EXISTS "cron_trigger_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "triggered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduled_at" TIMESTAMPTZ(6),
  "result" VARCHAR(20) NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cron_trigger_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_cron_trigger_audits_triggered_at"
  ON "cron_trigger_audits" ("triggered_at" DESC);

-- CreateTable: notification_snapshots
CREATE TABLE IF NOT EXISTS "notification_snapshots" (
  "id" SERIAL NOT NULL,
  "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "discipline_assignments" JSONB NOT NULL,
  "hash" TEXT NOT NULL,
  "delivery_status" VARCHAR(20) NOT NULL,
  "delivery_reason" TEXT,
  "railway_trigger_id" UUID,
  "next_delivery" TIMESTAMPTZ(6),
  CONSTRAINT "notification_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_notification_snapshots_hash"
  ON "notification_snapshots" ("hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_notification_snapshots_status"
  ON "notification_snapshots" ("delivery_status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_snapshots_railway_trigger_id_fkey'
  ) THEN
    ALTER TABLE "notification_snapshots"
      ADD CONSTRAINT "notification_snapshots_railway_trigger_id_fkey"
      FOREIGN KEY ("railway_trigger_id")
      REFERENCES "cron_trigger_audits" ("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

