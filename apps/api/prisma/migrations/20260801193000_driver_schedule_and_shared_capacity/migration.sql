CREATE TYPE "DriverAssignmentStatus" AS ENUM (
  'UNASSIGNED',
  'PENDING',
  'ACCEPTED',
  'REJECTED'
);

CREATE TYPE "ServiceRunStatus" AS ENUM (
  'PLANNED',
  'DRIVER_PENDING',
  'DRIVER_ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "Vehicle"
  ADD COLUMN "seatCapacity" INTEGER NOT NULL DEFAULT 4;

CREATE TABLE "ServiceRun" (
  "id" UUID NOT NULL,
  "runReference" TEXT NOT NULL,
  "direction" "BookingDirection" NOT NULL,
  "bookingType" "BookingType" NOT NULL,
  "travelDate" TIMESTAMP(3) NOT NULL,
  "driverId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "status" "ServiceRunStatus" NOT NULL DEFAULT 'PLANNED',
  "seatCapacity" INTEGER NOT NULL,
  "reservedSeats" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceRun_runReference_key"
  ON "ServiceRun"("runReference");
CREATE INDEX "ServiceRun_driverId_travelDate_idx"
  ON "ServiceRun"("driverId", "travelDate");
CREATE INDEX "ServiceRun_direction_bookingType_travelDate_idx"
  ON "ServiceRun"("direction", "bookingType", "travelDate");
CREATE INDEX "ServiceRun_status_travelDate_idx"
  ON "ServiceRun"("status", "travelDate");

ALTER TABLE "Trip"
  ADD COLUMN "serviceRunId" UUID,
  ADD COLUMN "driverAssignmentStatus" "DriverAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "driverRespondedAt" TIMESTAMP(3),
  ADD COLUMN "driverRejectionReason" TEXT;

CREATE INDEX "Trip_serviceRunId_driverAssignmentStatus_idx"
  ON "Trip"("serviceRunId", "driverAssignmentStatus");

ALTER TABLE "ServiceRun"
  ADD CONSTRAINT "ServiceRun_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceRun"
  ADD CONSTRAINT "ServiceRun_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Trip"
  ADD CONSTRAINT "Trip_serviceRunId_fkey"
  FOREIGN KEY ("serviceRunId") REFERENCES "ServiceRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
