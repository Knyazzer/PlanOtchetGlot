-- CreateTable
CREATE TABLE "nexus"."day_entry_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "changed_by" TEXT NOT NULL,
    "old_format" TEXT,
    "new_format" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_entry_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_entry_logs_user_id_date_idx" ON "nexus"."day_entry_logs"("user_id", "date");
