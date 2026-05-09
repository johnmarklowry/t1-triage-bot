-- CreateTable
CREATE TABLE "severity_context_overlay" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "patch_json" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(50),

    CONSTRAINT "severity_context_overlay_pkey" PRIMARY KEY ("id")
);
