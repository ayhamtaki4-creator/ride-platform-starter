CREATE TYPE "BookingDirection" AS ENUM (
  'BEIRUT_AIRPORT_TO_DAMASCUS',
  'DAMASCUS_TO_BEIRUT_AIRPORT'
);

CREATE TYPE "BookingType" AS ENUM (
  'SHARED_SEAT',
  'PRIVATE_CAR'
);

CREATE TYPE "BookingReviewStatus" AS ENUM (
  'NEW',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED'
);

CREATE TABLE "PricingRule" (
  "id" UUID NOT NULL,
  "direction" "BookingDirection" NOT NULL,
  "bookingType" "BookingType" NOT NULL,
  "passengerPrice" DECIMAL(12,2) NOT NULL,
  "driverFee" DECIMAL(12,2) NOT NULL,
  "platformMargin" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingRule_direction_bookingType_key"
  ON "PricingRule"("direction", "bookingType");
CREATE INDEX "PricingRule_isActive_direction_bookingType_idx"
  ON "PricingRule"("isActive", "direction", "bookingType");

ALTER TABLE "Trip"
  ADD COLUMN "pricingRuleId" UUID,
  ADD COLUMN "bookingReviewStatus" "BookingReviewStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "bookingReference" TEXT,
  ADD COLUMN "direction" "BookingDirection",
  ADD COLUMN "bookingType" "BookingType",
  ADD COLUMN "travelDate" TIMESTAMP(3),
  ADD COLUMN "flightArrivalTime" TEXT,
  ADD COLUMN "flightNumber" TEXT,
  ADD COLUMN "passengerCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "luggageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "driverFee" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "platformMargin" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Trip_bookingReference_key" ON "Trip"("bookingReference");
CREATE INDEX "Trip_bookingReviewStatus_requestedAt_idx"
  ON "Trip"("bookingReviewStatus", "requestedAt");
CREATE INDEX "Trip_travelDate_direction_idx"
  ON "Trip"("travelDate", "direction");

ALTER TABLE "Trip"
  ADD CONSTRAINT "Trip_pricingRuleId_fkey"
  FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
