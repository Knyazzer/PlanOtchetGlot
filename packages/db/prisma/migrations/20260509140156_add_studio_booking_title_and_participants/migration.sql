-- Add title column to studio_bookings
ALTER TABLE "studio_bookings" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';

-- Remove default after adding (column already populated)
ALTER TABLE "studio_bookings" ALTER COLUMN "title" DROP DEFAULT;

-- CreateTable studio_booking_participants
CREATE TABLE "studio_booking_participants" (
    "booking_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "studio_booking_participants_pkey" PRIMARY KEY ("booking_id","user_id")
);

-- AddForeignKey
ALTER TABLE "studio_booking_participants" ADD CONSTRAINT "studio_booking_participants_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "studio_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_booking_participants" ADD CONSTRAINT "studio_booking_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
