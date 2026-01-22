-- CreateTable
CREATE TABLE "discipline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "env" VARCHAR(16) NOT NULL,

    CONSTRAINT "discipline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discipline_name_env_key" ON "discipline"("name", "env");

-- AddForeignKey
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_sprint_index_fkey" FOREIGN KEY ("sprint_index") REFERENCES "sprints"("sprint_index") ON DELETE NO ACTION ON UPDATE NO ACTION;
