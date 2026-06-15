-- Link tasks to calendar events
ALTER TABLE "tasks" ADD COLUMN "calendar_event_id"  TEXT;
ALTER TABLE "tasks" ADD COLUMN "calendar_event_end" TIMESTAMP(3);
