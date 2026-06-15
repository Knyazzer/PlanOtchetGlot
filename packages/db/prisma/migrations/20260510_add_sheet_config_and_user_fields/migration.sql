-- Add isAdmin and theme fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'dark';

-- Create sheet_configs table
CREATE TABLE IF NOT EXISTS "sheet_configs" (
    "id" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "sheetUrl" TEXT,
    "apiKey" TEXT,
    "cachedData" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sheet_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sheet_configs_tableKey_key" ON "sheet_configs"("tableKey");
