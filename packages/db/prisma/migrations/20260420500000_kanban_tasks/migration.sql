CREATE TABLE kanban_tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT        NOT NULL REFERENCES status_rows(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL DEFAULT 'Новая задача',
  status        TEXT        NOT NULL DEFAULT 'request',
  created_by    TEXT        REFERENCES users(id) ON DELETE SET NULL,
  assignee_id   TEXT        REFERENCES project_members(id) ON DELETE SET NULL,
  date_start    DATE,
  date_end      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
