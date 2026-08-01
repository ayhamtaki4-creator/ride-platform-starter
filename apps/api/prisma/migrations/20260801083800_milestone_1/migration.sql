-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "estimatedDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DriverProfile_status_availability_idx" ON "DriverProfile"("status", "availability");
