-- CreateTable
CREATE TABLE "nexus"."requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "date_from" TEXT NOT NULL,
    "date_to" TEXT NOT NULL,
    "comment" TEXT,
    "approver_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requests_user_id_status_idx" ON "nexus"."requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "requests_approver_id_status_idx" ON "nexus"."requests"("approver_id", "status");

-- AddForeignKey
ALTER TABLE "nexus"."requests" ADD CONSTRAINT "requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nexus"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus"."requests" ADD CONSTRAINT "requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "nexus"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
