-- Add new ProjectStatus enum values
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'request';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'negotiation';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'preproduction';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'production';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'postproduction';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'cancelled';

-- Remove old values by recreating (requires no existing rows with old values)
-- Note: 'manual' is kept. 'preliminary', 'ready', 'completed' will be removed after data migration.
-- For safety we keep them for now and just add new ones.

-- Add sheetMatrixId column
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "sheet_matrix_id" TEXT;
