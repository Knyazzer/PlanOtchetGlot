-- AlterTable: add taskId to messages
ALTER TABLE "messages" ADD COLUMN "taskId" TEXT;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for looking up messages by task
CREATE INDEX "messages_taskId_idx" ON "messages"("taskId");
