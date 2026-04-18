-- Add financial fields to project_members
ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS rate_plan       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS rate_fact       NUMERIC(12,2);
