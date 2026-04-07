-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('zastroyka', 'efir');

-- CreateTable
CREATE TABLE "project_days" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "DayType" NOT NULL,
    "start_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_days_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "project_days" ADD CONSTRAINT "project_days_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
