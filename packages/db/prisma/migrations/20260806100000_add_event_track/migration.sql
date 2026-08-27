-- AlterTable: событие по треку (§9 «встречи внутри трека»)
ALTER TABLE "nexus"."events" ADD COLUMN "track_id" TEXT;

-- CreateIndex
CREATE INDEX "events_track_id_idx" ON "nexus"."events"("track_id");

-- AddForeignKey (удаление трека не удаляет событие — SetNull)
ALTER TABLE "nexus"."events" ADD CONSTRAINT "events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "nexus"."tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
