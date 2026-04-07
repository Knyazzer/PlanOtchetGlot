-- CreateEnum
CREATE TYPE "Role" AS ENUM ('employee', 'admin', 'producer');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('preliminary', 'ready', 'completed', 'manual');

-- CreateEnum
CREATE TYPE "ProjectSource" AS ENUM ('projects_table', 'manual');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('staff', 'ip_7', 'ip_8', 'ip_10', 'szt');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('zastroyka', 'efir', 'demontazh');

-- CreateEnum
CREATE TYPE "ShiftSource" AS ENUM ('matrix', 'manual');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('projects', 'registry', 'matrix');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('running', 'success', 'error');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('no_matrix', 'unmatched_name', 'data_conflict', 'schedule_change');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('sync', 'manual');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'employee',
    "tab_number" TEXT,
    "is_staff" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "client" TEXT,
    "name" TEXT NOT NULL,
    "exec_producer" TEXT,
    "line_producer" TEXT,
    "account_manager" TEXT,
    "date" TIMESTAMP(3),
    "date_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "date_approximate" TEXT,
    "time" TEXT,
    "format" TEXT,
    "location" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'preliminary',
    "source" "ProjectSource" NOT NULL DEFAULT 'projects_table',
    "matrix_url" TEXT,
    "uncertain_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "google_row_index" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matrix_registry" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "sheet_url" TEXT,
    "status" TEXT,
    "unit" TEXT,
    "client" TEXT,
    "name" TEXT,
    "format" TEXT,
    "date" TIMESTAMP(3),
    "producer" TEXT,
    "manager" TEXT,
    "curator" TEXT,
    "project_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matrix_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assignments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT,
    "unmatched_name" TEXT,
    "role_on_site" TEXT,
    "shift_format" TEXT,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'staff',
    "planned_shifts" INTEGER NOT NULL DEFAULT 0,
    "actual_shifts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_entries" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift_type" "ShiftType" NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "source" "ShiftSource" NOT NULL DEFAULT 'matrix',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "working_days" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "total_shifts" INTEGER NOT NULL DEFAULT 0,
    "overtime_shifts" INTEGER NOT NULL DEFAULT 0,
    "vacation_days" INTEGER NOT NULL DEFAULT 0,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "message" TEXT NOT NULL,
    "user_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "source" "ChangeSource" NOT NULL DEFAULT 'manual',
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "type" "SyncType" NOT NULL,
    "target_id" TEXT,
    "status" "SyncStatus" NOT NULL DEFAULT 'running',
    "changes_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_date_idx" ON "projects"("date");

-- CreateIndex
CREATE UNIQUE INDEX "matrix_registry_matrix_id_key" ON "matrix_registry"("matrix_id");

-- CreateIndex
CREATE UNIQUE INDEX "matrix_registry_project_id_key" ON "matrix_registry"("project_id");

-- CreateIndex
CREATE INDEX "shift_entries_user_id_date_idx" ON "shift_entries"("user_id", "date");

-- CreateIndex
CREATE INDEX "shift_entries_date_idx" ON "shift_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_summaries_user_id_year_month_key" ON "monthly_summaries"("user_id", "year", "month");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "matrix_registry" ADD CONSTRAINT "matrix_registry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "project_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_summaries" ADD CONSTRAINT "monthly_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
