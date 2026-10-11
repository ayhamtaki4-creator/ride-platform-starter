-- Existing trips retain their linked passenger; only new guest reservations may be unlinked.
ALTER TABLE "Trip" ALTER COLUMN "passengerId" DROP NOT NULL;
ALTER TABLE "Trip" ADD COLUMN "bookingSource" TEXT NOT NULL DEFAULT 'AUTHENTICATED';
ALTER TABLE "Trip" ADD COLUMN "accountLinkStatus" TEXT NOT NULL DEFAULT 'LINKED';
CREATE INDEX "Trip_bookingSource_accountLinkStatus_idx" ON "Trip"("bookingSource", "accountLinkStatus");
