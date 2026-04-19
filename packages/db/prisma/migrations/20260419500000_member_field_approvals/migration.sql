ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "field_approvals" JSONB NOT NULL DEFAULT '{}';
