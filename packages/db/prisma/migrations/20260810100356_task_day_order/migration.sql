-- AlterTable
ALTER TABLE "nexus"."tasks" DROP COLUMN "manual_order";

-- CreateTable
CREATE TABLE "nexus"."task_day_order" (
    "task_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "task_day_order_pkey" PRIMARY KEY ("task_id","day")
);

-- CreateIndex
CREATE INDEX "task_day_order_day_idx" ON "nexus"."task_day_order"("day");

-- AddForeignKey
ALTER TABLE "nexus"."task_day_order" ADD CONSTRAINT "task_day_order_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "nexus"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
