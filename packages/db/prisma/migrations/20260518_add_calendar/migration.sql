-- CreateTable events
CREATE TABLE "events" (
    "id"          TEXT        NOT NULL,
    "type"        TEXT        NOT NULL DEFAULT 'task',
    "title"       TEXT        NOT NULL,
    "description" TEXT        NOT NULL DEFAULT '',
    "date"        TIMESTAMP(3) NOT NULL,
    "start_time"  TEXT        NOT NULL,
    "end_time"    TEXT        NOT NULL,
    "status"      TEXT        NOT NULL DEFAULT 'pending',
    "author_id"   TEXT        NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable event_participants
CREATE TABLE "event_participants" (
    "event_id"    TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("event_id", "user_id")
);

-- CreateTable calendar_entries
CREATE TABLE "calendar_entries" (
    "id"             TEXT        NOT NULL,
    "type"           TEXT        NOT NULL,
    "title"          TEXT        NOT NULL,
    "description"    TEXT        NOT NULL DEFAULT '',
    "date"           TIMESTAMP(3) NOT NULL,
    "start_time"     TEXT,
    "end_time"       TEXT,
    "is_all_day"     BOOLEAN     NOT NULL DEFAULT false,
    "target_user_id" TEXT,
    "created_by_id"  TEXT        NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_author_id_idx" ON "events"("author_id");
CREATE INDEX "events_date_idx"      ON "events"("date");

CREATE INDEX "event_participants_user_id_idx" ON "event_participants"("user_id");

CREATE INDEX "calendar_entries_date_idx" ON "calendar_entries"("date");
CREATE INDEX "calendar_entries_type_idx" ON "calendar_entries"("type");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
