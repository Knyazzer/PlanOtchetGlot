-- CreateEnum
CREATE TYPE "nexus"."OrgLevel" AS ENUM ('member', 'head', 'director');

-- AlterTable
ALTER TABLE "nexus"."tasks" ADD COLUMN     "actual_minutes" INTEGER,
ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "client" TEXT,
ADD COLUMN     "division_id" TEXT,
ADD COLUMN     "done_at" TIMESTAMP(3),
ADD COLUMN     "legacy_id" TEXT,
ADD COLUMN     "manual_order" DOUBLE PRECISION,
ADD COLUMN     "planned_minutes" INTEGER,
ADD COLUMN     "project_id" TEXT,
ADD COLUMN     "recurring_parent_id" TEXT,
ADD COLUMN     "repeat_rule" TEXT,
ADD COLUMN     "repeat_until" TIMESTAMP(3),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'task';

-- AlterTable
ALTER TABLE "nexus"."users" ADD COLUMN     "legacy_emp_id" TEXT;

-- CreateTable
CREATE TABLE "nexus"."project_aliases" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "project_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."day_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "division_id" TEXT,
    "date" DATE NOT NULL,
    "day_format" TEXT NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "break_min" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "locked_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."day_format_versions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_work" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_format_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."board_columns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."task_placements" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "column_id" TEXT NOT NULL,
    "sort" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "task_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus"."department_modules" (
    "dept_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "edit_level" "nexus"."OrgLevel" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_modules_pkey" PRIMARY KEY ("dept_id","module_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_aliases_name_key" ON "nexus"."project_aliases"("name");

-- CreateIndex
CREATE INDEX "project_aliases_project_id_idx" ON "nexus"."project_aliases"("project_id");

-- CreateIndex
CREATE INDEX "day_entries_division_id_date_idx" ON "nexus"."day_entries"("division_id", "date");

-- CreateIndex
CREATE INDEX "day_entries_date_idx" ON "nexus"."day_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "day_entries_user_id_date_key" ON "nexus"."day_entries"("user_id", "date");

-- CreateIndex
CREATE INDEX "day_format_versions_key_effective_from_idx" ON "nexus"."day_format_versions"("key", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "day_format_versions_key_effective_from_key" ON "nexus"."day_format_versions"("key", "effective_from");

-- CreateIndex
CREATE INDEX "board_columns_user_id_order_idx" ON "nexus"."board_columns"("user_id", "order");

-- CreateIndex
CREATE INDEX "task_placements_column_id_sort_idx" ON "nexus"."task_placements"("column_id", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "task_placements_task_id_user_id_key" ON "nexus"."task_placements"("task_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_legacy_id_key" ON "nexus"."tasks"("legacy_id");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_startDate_idx" ON "nexus"."tasks"("assigneeId", "startDate");

-- CreateIndex
CREATE INDEX "tasks_division_id_startDate_idx" ON "nexus"."tasks"("division_id", "startDate");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "nexus"."tasks"("project_id");

-- CreateIndex
CREATE INDEX "tasks_recurring_parent_id_idx" ON "nexus"."tasks"("recurring_parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_legacy_emp_id_key" ON "nexus"."users"("legacy_emp_id");

-- AddForeignKey
ALTER TABLE "nexus"."tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "nexus"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."tasks" ADD CONSTRAINT "tasks_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "nexus"."divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."tasks" ADD CONSTRAINT "tasks_recurring_parent_id_fkey" FOREIGN KEY ("recurring_parent_id") REFERENCES "nexus"."tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."project_aliases" ADD CONSTRAINT "project_aliases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "nexus"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."day_entries" ADD CONSTRAINT "day_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."day_entries" ADD CONSTRAINT "day_entries_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "nexus"."divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."board_columns" ADD CONSTRAINT "board_columns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."task_placements" ADD CONSTRAINT "task_placements_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "nexus"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."task_placements" ADD CONSTRAINT "task_placements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."task_placements" ADD CONSTRAINT "task_placements_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "nexus"."board_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."department_modules" ADD CONSTRAINT "department_modules_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "nexus"."departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

