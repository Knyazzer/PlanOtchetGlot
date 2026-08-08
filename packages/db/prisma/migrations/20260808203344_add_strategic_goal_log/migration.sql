-- CreateTable
CREATE TABLE "nexus"."strategic_goal_logs" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategic_goal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategic_goal_logs_goal_id_created_at_idx" ON "nexus"."strategic_goal_logs"("goal_id", "created_at");

-- AddForeignKey
ALTER TABLE "nexus"."strategic_goal_logs" ADD CONSTRAINT "strategic_goal_logs_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "nexus"."strategic_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
