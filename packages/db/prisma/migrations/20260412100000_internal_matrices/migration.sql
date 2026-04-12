-- matrix_templates: store template Google Sheet links
CREATE TABLE matrix_templates (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT        NOT NULL,
  sheet_url  TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- project_members: free-form team members on internal projects
CREATE TABLE project_members (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT        NOT NULL REFERENCES status_rows(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  position   TEXT,
  shifts     JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- matrix_registry: add source (google | internal) and template reference
ALTER TABLE matrix_registry
  ADD COLUMN source      TEXT NOT NULL DEFAULT 'google',
  ADD COLUMN template_id TEXT REFERENCES matrix_templates(id) ON DELETE SET NULL;

-- status_rows: link to internal matrix + block slot
ALTER TABLE status_rows
  ADD COLUMN matrix_registry_id TEXT REFERENCES matrix_registry(id) ON DELETE SET NULL,
  ADD COLUMN block_slot         INTEGER;
