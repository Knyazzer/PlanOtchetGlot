-- AlterTable
ALTER TABLE "nexus"."tasks" ADD COLUMN     "goal_id" TEXT;

-- AlterTable
ALTER TABLE "nexus"."tracks" ADD COLUMN     "goal_id" TEXT;

-- CreateTable
CREATE TABLE "nexus"."strategic_goals" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dept_id" TEXT NOT NULL,
    "division_id" TEXT,
    "parent_goal_id" TEXT,
    "horizon" TEXT NOT NULL DEFAULT 'quarter',
    "period_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "outcome" TEXT,
    "carried_from_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,

    CONSTRAINT "strategic_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategic_goals_dept_id_period_key_idx" ON "nexus"."strategic_goals"("dept_id", "period_key");

-- CreateIndex
CREATE INDEX "strategic_goals_division_id_period_key_idx" ON "nexus"."strategic_goals"("division_id", "period_key");
