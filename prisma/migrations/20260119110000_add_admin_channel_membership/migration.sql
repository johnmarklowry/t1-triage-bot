-- CreateTable
CREATE TABLE "admin_channel_membership" (
  "slack_id" VARCHAR(50) NOT NULL,
  "is_member" BOOLEAN NOT NULL,
  "checked_at" TIMESTAMP(6) NOT NULL,
  "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_channel_membership_pkey" PRIMARY KEY ("slack_id")
);

-- CreateIndex
CREATE INDEX "idx_admin_channel_membership_checked_at" ON "admin_channel_membership"("checked_at");

