-- Track when the assignee first viewed a task (null = new/unseen)
ALTER TABLE tasks ADD COLUMN seen_at TIMESTAMP(3);
-- All existing tasks are considered already seen
UPDATE tasks SET seen_at = CURRENT_TIMESTAMP;
