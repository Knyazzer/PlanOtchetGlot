-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'done', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "FinancialFlag" AS ENUM ('pending', 'paid');

-- CreateEnum
CREATE TYPE "WIStatus" AS ENUM ('draft', 'active', 'done', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "WorkItemSource" AS ENUM ('sync', 'manual', 'separator', 'internal');

-- CreateEnum
CREATE TYPE "DeptSubstatus" AS ENUM ('not_started', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "DeptType" AS ENUM ('production', 'support', 'internal');

-- CreateEnum
CREATE TYPE "HRStatusType" AS ENUM ('vacation', 'sick', 'remote', 'business_trip', 'day_off');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('preliminary', 'confirmed', 'blocked');

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
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('sync', 'manual');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('zastroyka', 'efir', 'deadline', 'semka');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('preliminary', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('no_matrix', 'unmatched_name', 'data_conflict', 'schedule_change', 'task_assigned', 'task_overdue', 'task_closed', 'wi_status_changed', 'project_status_changed', 'dept_connected_to_wi', 'hr_request_created', 'hr_request_resolved', 'studio_conflict', 'meeting_invite');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
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
    "name" TEXT NOT NULL,
    "client" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "financial_flag" "FinancialFlag" NOT NULL DEFAULT 'pending',
    "account_manager_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "exec_producer" TEXT,
    "line_producer" TEXT,
    "account_manager" TEXT,
    "date" TIMESTAMP(3),
    "date_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "date_approximate" TEXT,
    "time" TEXT,
    "format" TEXT,
    "location" TEXT,
    "post_production" TEXT,
    "status" "WIStatus" NOT NULL DEFAULT 'draft',
    "source" "WorkItemSource" NOT NULL DEFAULT 'manual',
    "matrix_url" TEXT,
    "sheet_matrix_id" TEXT,
    "notes" TEXT,
    "uncertain_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "google_row_index" INTEGER,
    "matrix_registry_id" TEXT,
    "block_slot" INTEGER,
    "field_approvals" JSONB,
    "group_schedule" JSONB,
    "parent_wi_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeptType" NOT NULL,
    "parent_id" TEXT,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dept_members" (
    "user_id" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "is_head" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dept_members_pkey" PRIMARY KEY ("user_id","dept_id")
);

-- CreateTable
CREATE TABLE "dept_wi_links" (
    "id" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "wi_id" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "substatus" "DeptSubstatus" NOT NULL DEFAULT 'not_started',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dept_wi_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "deadline" TIMESTAMP(3),
    "is_overdue" BOOLEAN NOT NULL DEFAULT false,
    "dept_id" TEXT,
    "wi_id" TEXT,
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
CREATE TABLE "hr_statuses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "HRStatusType" NOT NULL,
    "date_from" TIMESTAMP(3) NOT NULL,
    "date_to" TIMESTAMP(3) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "approver_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_bookings" (
    "id" TEXT NOT NULL,
    "studio" TEXT NOT NULL,
    "wi_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "time_from" TEXT,
    "time_to" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'preliminary',
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time_from" TEXT,
    "time_to" TEXT,
    "dept_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_participants" (
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "calendar_event_participants_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "project_days" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "DayType" NOT NULL,
    "start_time" TEXT,
    "time_from" TEXT,
    "time_to" TEXT,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "first_motor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_days_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "shifts" JSONB NOT NULL DEFAULT '{}',
    "employment_type" TEXT,
    "rate_plan" DECIMAL(12,2),
    "rate_fact" DECIMAL(12,2),
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "field_approvals" JSONB,
    "group_name" TEXT,
    "telegram_username" TEXT,
    "is_freelancer" BOOLEAN NOT NULL DEFAULT false,
    "payment_type" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "payment_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matrix_registry" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "sheet_url" TEXT,
    "status" TEXT,
    "unit" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "client" TEXT,
    "name" TEXT,
    "format" TEXT,
    "date" TIMESTAMP(3),
    "producer" TEXT,
    "manager" TEXT,
    "curator" TEXT,
    "project_id" TEXT,
    "google_row_index" INTEGER,
    "has_shifts_data" BOOLEAN,
    "shifts_cache" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "project_name" TEXT,
    "kp_link" TEXT,
    "brief" TEXT,
    "revenue_plan" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'google',
    "template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matrix_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matrix_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheet_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matrix_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_configs" (
    "id" TEXT NOT NULL,
    "table_key" TEXT NOT NULL,
    "sheet_url" TEXT,
    "api_key" TEXT,
    "cached_data" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matrix_notes" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matrix_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matrix_documents" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matrix_documents_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "client" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'preliminary',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_work_items" (
    "deal_id" TEXT NOT NULL,
    "wi_id" TEXT NOT NULL,

    CONSTRAINT "deal_work_items_pkey" PRIMARY KEY ("deal_id","wi_id")
);

-- CreateTable
CREATE TABLE "deal_matrices" (
    "deal_id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,

    CONSTRAINT "deal_matrices_pkey" PRIMARY KEY ("deal_id","matrix_id")
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
CREATE TABLE "user_notification_reads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notification_reads_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "work_items_date_idx" ON "work_items"("date");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dept_wi_links_dept_id_wi_id_key" ON "dept_wi_links"("dept_id", "wi_id");

-- CreateIndex
CREATE INDEX "tasks_deadline_idx" ON "tasks"("deadline");

-- CreateIndex
CREATE INDEX "tasks_is_overdue_idx" ON "tasks"("is_overdue");

-- CreateIndex
CREATE INDEX "hr_statuses_user_id_date_from_date_to_idx" ON "hr_statuses"("user_id", "date_from", "date_to");

-- CreateIndex
CREATE INDEX "studio_bookings_studio_date_idx" ON "studio_bookings"("studio", "date");

-- CreateIndex
CREATE INDEX "calendar_events_date_idx" ON "calendar_events"("date");

-- CreateIndex
CREATE INDEX "shift_entries_user_id_date_idx" ON "shift_entries"("user_id", "date");

-- CreateIndex
CREATE INDEX "shift_entries_date_idx" ON "shift_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_summaries_user_id_year_month_key" ON "monthly_summaries"("user_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "matrix_registry_matrix_id_key" ON "matrix_registry"("matrix_id");

-- CreateIndex
CREATE UNIQUE INDEX "matrix_registry_project_id_key" ON "matrix_registry"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_configs_table_key_key" ON "sheet_configs"("table_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "user_notification_reads_user_id_idx" ON "user_notification_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_reads_user_id_notification_id_key" ON "user_notification_reads"("user_id", "notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parent_wi_id_fkey" FOREIGN KEY ("parent_wi_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_matrix_registry_id_fkey" FOREIGN KEY ("matrix_registry_id") REFERENCES "matrix_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dept_members" ADD CONSTRAINT "dept_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dept_members" ADD CONSTRAINT "dept_members_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dept_wi_links" ADD CONSTRAINT "dept_wi_links_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dept_wi_links" ADD CONSTRAINT "dept_wi_links_wi_id_fkey" FOREIGN KEY ("wi_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_wi_id_fkey" FOREIGN KEY ("wi_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_statuses" ADD CONSTRAINT "hr_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_statuses" ADD CONSTRAINT "hr_statuses_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_bookings" ADD CONSTRAINT "studio_bookings_wi_id_fkey" FOREIGN KEY ("wi_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_bookings" ADD CONSTRAINT "studio_bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_days" ADD CONSTRAINT "project_days_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "project_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_entries" ADD CONSTRAINT "shift_entries_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_summaries" ADD CONSTRAINT "monthly_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matrix_registry" ADD CONSTRAINT "matrix_registry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matrix_notes" ADD CONSTRAINT "matrix_notes_matrix_id_fkey" FOREIGN KEY ("matrix_id") REFERENCES "matrix_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matrix_notes" ADD CONSTRAINT "matrix_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matrix_documents" ADD CONSTRAINT "matrix_documents_matrix_id_fkey" FOREIGN KEY ("matrix_id") REFERENCES "matrix_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_work_items" ADD CONSTRAINT "deal_work_items_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_work_items" ADD CONSTRAINT "deal_work_items_wi_id_fkey" FOREIGN KEY ("wi_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_matrices" ADD CONSTRAINT "deal_matrices_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_matrices" ADD CONSTRAINT "deal_matrices_matrix_id_fkey" FOREIGN KEY ("matrix_id") REFERENCES "matrix_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_reads" ADD CONSTRAINT "user_notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_reads" ADD CONSTRAINT "user_notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
