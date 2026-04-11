-- DropForeignKey
ALTER TABLE "matrix_registry" DROP CONSTRAINT "matrix_registry_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_assignments" DROP CONSTRAINT "project_assignments_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_days" DROP CONSTRAINT "project_days_project_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_entries" DROP CONSTRAINT "shift_entries_project_id_fkey";

-- AlterTable
ALTER TABLE "matrix_registry" ADD COLUMN     "google_row_index" INTEGER;

-- AddForeignKey
ALTER TABLE "project_days" ADD CONSTRAINT "project_days_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "status_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matrix_registry" ADD CONSTRAINT "matrix_registry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "status_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "status_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "status_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
