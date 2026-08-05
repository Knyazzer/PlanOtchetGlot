-- AlterTable: связь чат↔трек (§9 «трек = чат»)
ALTER TABLE "nexus"."chats" ADD COLUMN "track_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chats_track_id_key" ON "nexus"."chats"("track_id");

-- AddForeignKey
ALTER TABLE "nexus"."chats" ADD CONSTRAINT "chats_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "nexus"."tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
