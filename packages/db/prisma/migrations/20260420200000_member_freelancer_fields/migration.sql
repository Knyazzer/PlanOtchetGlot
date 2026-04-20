ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "is_freelancer" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "payment_type" TEXT;
ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "payment_amount" NUMERIC(12,2);
