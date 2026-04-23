-- Add parent_task_id to support task→department hierarchy
-- Departments link to their parent task via this field; top-level tasks have it NULL
ALTER TABLE "status_rows"
  ADD COLUMN IF NOT EXISTS "parent_task_id" TEXT REFERENCES "status_rows"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "status_rows_parent_task_id_idx" ON "status_rows"("parent_task_id");
