CREATE TABLE "stages" (
  "id"       TEXT    NOT NULL,
  "track_id" TEXT    NOT NULL,
  "title"    TEXT    NOT NULL,
  "order"    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "stages_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "stages_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "stages_track_id_idx" ON "stages"("track_id");

ALTER TABLE "tasks" ADD COLUMN "stage_id" TEXT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_id_fkey"
  FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
