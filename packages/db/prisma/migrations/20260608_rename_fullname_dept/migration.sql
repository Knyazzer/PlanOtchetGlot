-- Rename fullName → name (align with shared.users contract)
ALTER TABLE "users" RENAME COLUMN "fullName" TO "name";

-- Rename dept → department (align with shared.users contract)
ALTER TABLE "users" RENAME COLUMN "dept" TO "department";
