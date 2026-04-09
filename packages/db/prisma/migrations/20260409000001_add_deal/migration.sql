-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('preliminary', 'in_progress', 'completed');

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "client" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'preliminary',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_status_rows" (
    "deal_id" TEXT NOT NULL,
    "status_row_id" TEXT NOT NULL,

    CONSTRAINT "deal_status_rows_pkey" PRIMARY KEY ("deal_id","status_row_id")
);

-- CreateTable
CREATE TABLE "deal_matrices" (
    "deal_id" TEXT NOT NULL,
    "matrix_id" TEXT NOT NULL,

    CONSTRAINT "deal_matrices_pkey" PRIMARY KEY ("deal_id","matrix_id")
);

-- AddForeignKey
ALTER TABLE "deal_status_rows" ADD CONSTRAINT "deal_status_rows_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_status_rows" ADD CONSTRAINT "deal_status_rows_status_row_id_fkey"
    FOREIGN KEY ("status_row_id") REFERENCES "status_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_matrices" ADD CONSTRAINT "deal_matrices_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_matrices" ADD CONSTRAINT "deal_matrices_matrix_id_fkey"
    FOREIGN KEY ("matrix_id") REFERENCES "matrix_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
