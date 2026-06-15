-- CreateEnum
CREATE TYPE "TrackType" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "TrackStatus" AS ENUM ('active', 'done', 'archived');

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "TrackType" NOT NULL DEFAULT 'internal',
    "status" "TrackStatus" NOT NULL DEFAULT 'active',
    "client_name" TEXT,
    "deadline" TIMESTAMP(3),
    "leader_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_members" (
    "track_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_members_pkey" PRIMARY KEY ("track_id","user_id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "track_id" TEXT;

-- CreateIndex
CREATE INDEX "tracks_leader_id_idx" ON "tracks"("leader_id");

-- CreateIndex
CREATE INDEX "track_members_user_id_idx" ON "track_members"("user_id");

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_members" ADD CONSTRAINT "track_members_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_members" ADD CONSTRAINT "track_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
