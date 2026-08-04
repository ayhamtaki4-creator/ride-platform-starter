-- Replace passenger/luggage-driven private-car selection with an explicit vehicle class.
-- Existing bookings keep their selected class through the linked pricing rule.

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "vehicleClass" "VehicleClass";

UPDATE "Trip" AS trip
SET "vehicleClass" = rule."vehicleClass"
FROM "PricingRule" AS rule
WHERE trip."pricingRuleId" = rule."id"
  AND trip."vehicleClass" IS NULL;

UPDATE "Trip"
SET "vehicleClass" = 'SMALL'
WHERE "vehicleClass" IS NULL;

ALTER TABLE "Trip"
  ALTER COLUMN "vehicleClass" SET DEFAULT 'SMALL',
  ALTER COLUMN "vehicleClass" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "VehicleClassConfig" (
  "vehicleClass" "VehicleClass" NOT NULL,
  "passengerCapacity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleClassConfig_pkey" PRIMARY KEY ("vehicleClass"),
  CONSTRAINT "VehicleClassConfig_passengerCapacity_check"
    CHECK ("passengerCapacity" BETWEEN 1 AND 30)
);

INSERT INTO "VehicleClassConfig" (
  "vehicleClass",
  "passengerCapacity",
  "createdAt",
  "updatedAt"
)
VALUES
  ('SMALL', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MEDIUM', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('LARGE', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("vehicleClass") DO NOTHING;
