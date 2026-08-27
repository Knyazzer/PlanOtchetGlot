-- AlterTable
ALTER TABLE "nexus"."day_entries" ADD COLUMN     "place" TEXT;

-- Data-миграция: место работы было в day_format (office/remote/project/trip) → выносим в place,
-- а статус дня становится 'working'. Статусы weekend/vacation/sick/dayoff остаются как есть (place = NULL).
UPDATE "nexus"."day_entries"
   SET "place" = "day_format",
       "day_format" = 'working'
 WHERE "day_format" IN ('office', 'remote', 'project', 'trip');
