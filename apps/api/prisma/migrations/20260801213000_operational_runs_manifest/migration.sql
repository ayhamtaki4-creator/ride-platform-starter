ALTER TYPE "ServiceRunStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ServiceRunStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "ServiceRunStatus" ADD VALUE IF NOT EXISTS 'BOARDING';
ALTER TYPE "ServiceRunStatus" ADD VALUE IF NOT EXISTS 'DRIVER_REPLACEMENT_REQUIRED';

CREATE TYPE "ServiceRunPassengerStatus" AS ENUM (
  'WAITING',
  'PICKED_UP',
  'NO_SHOW',
  'DROPPED_OFF'
);

ALTER TABLE "ServiceRun"
  ADD COLUMN "driverAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "boardingStartedAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "driverRejectionReason" TEXT;

ALTER TABLE "Trip"
  ADD COLUMN "serviceRunPassengerStatus" "ServiceRunPassengerStatus" NOT NULL DEFAULT 'WAITING',
  ADD COLUMN "pickupOrder" INTEGER,
  ADD COLUMN "pickedUpAt" TIMESTAMP(3),
  ADD COLUMN "noShowAt" TIMESTAMP(3),
  ADD COLUMN "droppedOffAt" TIMESTAMP(3);

CREATE INDEX "Trip_serviceRunId_serviceRunPassengerStatus_idx"
  ON "Trip"("serviceRunId", "serviceRunPassengerStatus");
