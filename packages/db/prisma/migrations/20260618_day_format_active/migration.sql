-- Флаг активности формата дня: false = формат снят с использования (retire).
-- История считается по активным версиям прошлых периодов (Q-DAY-5).
ALTER TABLE "nexus"."day_format_versions" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
