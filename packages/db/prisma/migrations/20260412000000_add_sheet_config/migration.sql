CREATE TABLE "sheet_configs" (
    "id" TEXT NOT NULL,
    "table_key" TEXT NOT NULL,
    "sheet_url" TEXT,
    "cached_data" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sheet_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sheet_configs_table_key_key" ON "sheet_configs"("table_key");
