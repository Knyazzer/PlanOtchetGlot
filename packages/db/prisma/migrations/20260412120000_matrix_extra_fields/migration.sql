-- Add extra fields to matrix_registry for internal matrices
ALTER TABLE matrix_registry
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS kp_link      TEXT,
  ADD COLUMN IF NOT EXISTS brief        TEXT;
