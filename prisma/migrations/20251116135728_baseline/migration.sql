-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "table_name" VARCHAR(50) NOT NULL,
    "record_id" INTEGER,
    "operation" VARCHAR(20) NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "changed_by" VARCHAR(50),
    "changed_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_state" (
    "id" SERIAL NOT NULL,
    "sprint_index" INTEGER,
    "account_slack_id" VARCHAR(50),
    "producer_slack_id" VARCHAR(50),
    "po_slack_id" VARCHAR(50),
    "ui_eng_slack_id" VARCHAR(50),
    "be_eng_slack_id" VARCHAR(50),
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "current_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migrations" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "executed_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "checksum" VARCHAR(64),

    CONSTRAINT "migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overrides" (
    "id" SERIAL NOT NULL,
    "sprint_index" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "original_slack_id" VARCHAR(50),
    "replacement_slack_id" VARCHAR(50) NOT NULL,
    "replacement_name" VARCHAR(100),
    "requested_by" VARCHAR(50) NOT NULL,
    "approved" BOOLEAN DEFAULT false,
    "approved_by" VARCHAR(50),
    "approval_timestamp" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" SERIAL NOT NULL,
    "sprint_name" VARCHAR(50) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "sprint_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "slack_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "discipline" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_logs_changed_at" ON "audit_logs"("changed_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_table_record" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "current_state_single_record" ON "current_state"("id");

-- CreateIndex
CREATE UNIQUE INDEX "migrations_filename_key" ON "migrations"("filename");

-- CreateIndex
CREATE INDEX "idx_overrides_approved" ON "overrides"("approved");

-- CreateIndex
CREATE INDEX "idx_overrides_sprint_role" ON "overrides"("sprint_index", "role");

-- CreateIndex
CREATE UNIQUE INDEX "overrides_unique_request" ON "overrides"("sprint_index", "role", "requested_by", "replacement_slack_id");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_sprint_index_key" ON "sprints"("sprint_index");

-- CreateIndex
CREATE INDEX "idx_sprints_dates" ON "sprints"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_sprints_index" ON "sprints"("sprint_index");

-- CreateIndex
CREATE UNIQUE INDEX "users_slack_id_key" ON "users"("slack_id");

-- CreateIndex
CREATE INDEX "idx_users_discipline" ON "users"("discipline");

-- CreateIndex
CREATE INDEX "idx_users_slack_id" ON "users"("slack_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_slack_discipline_unique" ON "users"("slack_id", "discipline");

-- AddForeignKey
ALTER TABLE "current_state" ADD CONSTRAINT "current_state_sprint_index_fkey" FOREIGN KEY ("sprint_index") REFERENCES "sprints"("sprint_index") ON DELETE NO ACTION ON UPDATE NO ACTION;
