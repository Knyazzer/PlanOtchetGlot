-- CreateTable
CREATE TABLE "nexus"."task_templates" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT,
    "planned_minutes" INTEGER,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_templates_owner_id_sort_order_idx" ON "nexus"."task_templates"("owner_id", "sort_order");

-- AddForeignKey
ALTER TABLE "nexus"."task_templates" ADD CONSTRAINT "task_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "nexus"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
