-- Create shift_expenses table (used by /shift-expenses route in matrixExtras)
CREATE TABLE IF NOT EXISTS "shift_expenses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "expense_type" TEXT NOT NULL,
    "ordered_by" TEXT,
    "amount" NUMERIC(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_expenses_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'shift_expenses_project_id_fkey'
  ) THEN
    ALTER TABLE "shift_expenses" ADD CONSTRAINT "shift_expenses_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "status_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
