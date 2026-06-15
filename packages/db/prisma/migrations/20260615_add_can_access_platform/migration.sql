-- Флаг доступа к платформе Nexus (временный роллаут, аналог can_access_inventory)
ALTER TABLE "nexus"."users" ADD COLUMN IF NOT EXISTS "can_access_platform" BOOLEAN NOT NULL DEFAULT false;
