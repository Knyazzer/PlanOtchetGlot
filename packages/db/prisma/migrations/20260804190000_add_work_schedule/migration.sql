-- CreateTable
CREATE TABLE "nexus"."work_schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mon" TEXT NOT NULL DEFAULT 'office',
    "tue" TEXT NOT NULL DEFAULT 'office',
    "wed" TEXT NOT NULL DEFAULT 'office',
    "thu" TEXT NOT NULL DEFAULT 'office',
    "fri" TEXT NOT NULL DEFAULT 'office',
    "sat" TEXT NOT NULL DEFAULT 'dayoff',
    "sun" TEXT NOT NULL DEFAULT 'dayoff',
    "work_start" TEXT NOT NULL DEFAULT '10:00',
    "work_end" TEXT NOT NULL DEFAULT '18:30',
    "break_min" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_user_id_key" ON "nexus"."work_schedules"("user_id");

-- AddForeignKey
ALTER TABLE "nexus"."work_schedules" ADD CONSTRAINT "work_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
