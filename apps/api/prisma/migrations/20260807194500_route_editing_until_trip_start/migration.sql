-- Allow operations and the passenger to refine the route after a driver is assigned,
-- but freeze the approved route once the trip actually starts or reaches a terminal state.

DROP TRIGGER IF EXISTS "Trip_lock_route_plan_on_assignment" ON "Trip";
DROP FUNCTION IF EXISTS lock_trip_route_plan_on_assignment();

UPDATE "TripRoutePlan" plan
SET "lockedAt" = CASE
      WHEN trip."status"::text IN (
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED_BY_PASSENGER',
        'CANCELLED_BY_DRIVER',
        'NO_DRIVER_AVAILABLE',
        'PASSENGER_NO_SHOW',
        'DRIVER_NO_SHOW'
      ) THEN COALESCE(plan."lockedAt", CURRENT_TIMESTAMP)
      ELSE NULL
    END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Trip" trip
WHERE plan."tripId" = trip."id";

CREATE OR REPLACE FUNCTION lock_trip_route_plan_on_trip_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status"::text IN (
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'NO_DRIVER_AVAILABLE',
    'PASSENGER_NO_SHOW',
    'DRIVER_NO_SHOW'
  ) THEN
    UPDATE "TripRoutePlan"
    SET "lockedAt" = COALESCE("lockedAt", CURRENT_TIMESTAMP),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tripId" = NEW."id";
  ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
    UPDATE "TripRoutePlan"
    SET "lockedAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tripId" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Trip_lock_route_plan_on_trip_status"
AFTER UPDATE OF "status" ON "Trip"
FOR EACH ROW
EXECUTE FUNCTION lock_trip_route_plan_on_trip_status();
