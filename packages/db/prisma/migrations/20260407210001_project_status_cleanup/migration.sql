-- Migrate existing rows with old status values to new ones
UPDATE "projects" SET "status" = 'request'     WHERE "status" = 'preliminary';
UPDATE "projects" SET "status" = 'delivered'   WHERE "status" = 'completed';
UPDATE "projects" SET "status" = 'negotiation' WHERE "status" = 'ready';

-- Drop default before changing enum type
ALTER TABLE "projects" ALTER COLUMN "status" DROP DEFAULT;

-- Recreate enum without old values
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";
CREATE TYPE "ProjectStatus" AS ENUM (
  'request', 'negotiation', 'preproduction', 'production',
  'postproduction', 'delivered', 'rejected', 'cancelled', 'manual'
);
ALTER TABLE "projects"
  ALTER COLUMN "status" TYPE "ProjectStatus"
  USING "status"::text::"ProjectStatus";
DROP TYPE "ProjectStatus_old";

-- Restore default with new type
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'request'::"ProjectStatus";
