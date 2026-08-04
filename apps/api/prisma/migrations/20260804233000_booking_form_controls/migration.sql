BEGIN;

ALTER TABLE "ServiceRoute"
  ADD COLUMN IF NOT EXISTS "flightTicketUploadEnabled" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "VehicleClassConfig"
  ADD COLUMN IF NOT EXISTS "luggageCapacity" INTEGER NOT NULL DEFAULT 4;

UPDATE "VehicleClassConfig"
SET "luggageCapacity" = CASE "vehicleClass"::TEXT
  WHEN 'SMALL' THEN 4
  WHEN 'MEDIUM' THEN 5
  WHEN 'LARGE' THEN 8
  ELSE "luggageCapacity"
END;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'VehicleClassConfig_luggageCapacity_check'
      AND conrelid = '"VehicleClassConfig"'::regclass
  ) THEN
    ALTER TABLE "VehicleClassConfig"
      ADD CONSTRAINT "VehicleClassConfig_luggageCapacity_check"
      CHECK ("luggageCapacity" BETWEEN 0 AND 30);
  END IF;
END
$constraint$;

COMMIT;
