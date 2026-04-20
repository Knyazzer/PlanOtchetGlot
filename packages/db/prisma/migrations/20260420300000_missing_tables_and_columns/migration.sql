-- Add missing columns to project_days
ALTER TABLE "project_days" ADD COLUMN IF NOT EXISTS "time_from" TEXT;
ALTER TABLE "project_days" ADD COLUMN IF NOT EXISTS "time_to" TEXT;
ALTER TABLE "project_days" ADD COLUMN IF NOT EXISTS "all_day" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "project_days" ADD COLUMN IF NOT EXISTS "first_motor" TEXT;

-- Add missing DayType enum values
ALTER TYPE "DayType" ADD VALUE IF NOT EXISTS 'deadline';
ALTER TYPE "DayType" ADD VALUE IF NOT EXISTS 'semka';

-- Create gantt_tasks table
CREATE TABLE IF NOT EXISTS "gantt_tasks" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gantt_tasks_pkey" PRIMARY KEY ("id")
);

-- Add FK for gantt_tasks if matrix_registry exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'gantt_tasks_matrix_id_fkey'
  ) THEN
    ALTER TABLE "gantt_tasks" ADD CONSTRAINT "gantt_tasks_matrix_id_fkey"
      FOREIGN KEY ("matrix_id") REFERENCES "matrix_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Create matrix_notes table
CREATE TABLE IF NOT EXISTS "matrix_notes" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matrix_notes_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'matrix_notes_matrix_id_fkey'
  ) THEN
    ALTER TABLE "matrix_notes" ADD CONSTRAINT "matrix_notes_matrix_id_fkey"
      FOREIGN KEY ("matrix_id") REFERENCES "matrix_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'matrix_notes_user_id_fkey'
  ) THEN
    ALTER TABLE "matrix_notes" ADD CONSTRAINT "matrix_notes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Create matrix_documents table
CREATE TABLE IF NOT EXISTS "matrix_documents" (
    "id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matrix_documents_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'matrix_documents_matrix_id_fkey'
  ) THEN
    ALTER TABLE "matrix_documents" ADD CONSTRAINT "matrix_documents_matrix_id_fkey"
      FOREIGN KEY ("matrix_id") REFERENCES "matrix_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
