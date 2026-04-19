ALTER TABLE "matrix_registry"
  ALTER COLUMN "unit" TYPE TEXT[]
  USING CASE
    WHEN "unit" IS NULL OR "unit" = '' THEN ARRAY[]::TEXT[]
    ELSE ARRAY["unit"]
  END;

ALTER TABLE "matrix_registry"
  ALTER COLUMN "unit" SET DEFAULT '{}';

ALTER TABLE "matrix_registry"
  ALTER COLUMN "unit" SET NOT NULL;
