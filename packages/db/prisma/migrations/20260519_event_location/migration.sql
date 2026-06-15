-- Add location array to events table
ALTER TABLE "events" ADD COLUMN "location" TEXT[] NOT NULL DEFAULT '{}';
