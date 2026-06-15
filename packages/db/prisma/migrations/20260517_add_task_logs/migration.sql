CREATE TABLE "task_logs" (
    "id"        TEXT NOT NULL,
    "taskId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "meta"      JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
