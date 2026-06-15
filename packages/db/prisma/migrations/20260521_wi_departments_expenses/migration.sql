-- Add budget to work_items
ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "budget" DECIMAL(12,2);

-- Create work_item_divisions junction table
CREATE TABLE IF NOT EXISTS "work_item_divisions" (
    "work_item_id" TEXT NOT NULL,
    "division_id"  TEXT NOT NULL,
    CONSTRAINT "work_item_divisions_pkey" PRIMARY KEY ("work_item_id", "division_id")
);

ALTER TABLE "work_item_divisions"
    ADD CONSTRAINT "work_item_divisions_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_item_divisions"
    ADD CONSTRAINT "work_item_divisions_division_id_fkey"
    FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "work_item_divisions_division_id_idx" ON "work_item_divisions"("division_id");

-- Create ExpenseCategory enum
DO $$ BEGIN
    CREATE TYPE "ExpenseCategory" AS ENUM ('equipment', 'transport', 'fees', 'postproduction', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create expenses table
CREATE TABLE IF NOT EXISTS "expenses" (
    "id"           TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "amount"       DECIMAL(12,2) NOT NULL,
    "category"     "ExpenseCategory" NOT NULL DEFAULT 'other',
    "description"  TEXT NOT NULL DEFAULT '',
    "date"         TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "expenses_work_item_id_idx" ON "expenses"("work_item_id");
