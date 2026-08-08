-- CreateTable
CREATE TABLE "nexus"."personal_goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_goals_user_id_idx" ON "nexus"."personal_goals"("user_id");

-- AddForeignKey
ALTER TABLE "nexus"."personal_goals" ADD CONSTRAINT "personal_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
