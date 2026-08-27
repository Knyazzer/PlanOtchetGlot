-- AlterTable
ALTER TABLE "nexus"."strategic_goals" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'goal';

-- CreateTable
CREATE TABLE "nexus"."meeting_notes" (
    "id" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_notes_dept_id_period_key_key" ON "nexus"."meeting_notes"("dept_id", "period_key");
