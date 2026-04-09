-- Rename table projects → status_rows
ALTER TABLE "projects" RENAME TO "status_rows";

-- Rename FK constraints on status_rows
ALTER TABLE "status_rows" RENAME CONSTRAINT "projects_pkey" TO "status_rows_pkey";

-- Rename dependent tables' columns (project_id stays the same, but constraints reference old table)
-- project_days
ALTER TABLE "project_days" DROP CONSTRAINT IF EXISTS "project_days_project_id_fkey";
ALTER TABLE "project_days" ADD CONSTRAINT "project_days_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "status_rows"("id") ON DELETE CASCADE;

-- project_assignments
ALTER TABLE "project_assignments" DROP CONSTRAINT IF EXISTS "project_assignments_project_id_fkey";
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "status_rows"("id") ON DELETE CASCADE;

-- shift_entries
ALTER TABLE "shift_entries" DROP CONSTRAINT IF EXISTS "shift_entries_project_id_fkey";
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "status_rows"("id");

-- matrix_registry
ALTER TABLE "matrix_registry" DROP CONSTRAINT IF EXISTS "matrix_registry_project_id_fkey";
ALTER TABLE "matrix_registry" ADD CONSTRAINT "matrix_registry_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "status_rows"("id");

-- Rename enums
ALTER TYPE "ProjectStatus" RENAME TO "StatusRowStatus";
ALTER TYPE "ProjectSource" RENAME TO "StatusRowSource";

-- Rename index
ALTER INDEX IF EXISTS "projects_date_idx" RENAME TO "status_rows_date_idx";
