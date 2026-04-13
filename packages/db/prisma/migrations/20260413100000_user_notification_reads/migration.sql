-- CreateTable: per-user read tracking for global notifications (userId = null)
CREATE TABLE "user_notification_reads" (
    "id"              TEXT        NOT NULL,
    "user_id"         TEXT        NOT NULL,
    "notification_id" TEXT        NOT NULL,
    "read_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notification_reads_pkey" PRIMARY KEY ("id")
);

-- Unique: each user can only have one read record per notification
ALTER TABLE "user_notification_reads"
    ADD CONSTRAINT "user_notification_reads_user_id_notification_id_key"
    UNIQUE ("user_id", "notification_id");

-- Index for fast lookups by user
CREATE INDEX "user_notification_reads_user_id_idx"
    ON "user_notification_reads"("user_id");

-- FK: user_id → users.id (cascade delete)
ALTER TABLE "user_notification_reads"
    ADD CONSTRAINT "user_notification_reads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: notification_id → notifications.id (cascade delete)
ALTER TABLE "user_notification_reads"
    ADD CONSTRAINT "user_notification_reads_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notifications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
