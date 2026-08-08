-- Repair stale production booking policies for airport-transfer routes.
-- The airport endpoint is fixed; the non-airport endpoint remains passenger-selectable.
UPDATE "RouteBookingPolicy" AS policy
SET
  "passengerCanEditPickup" = CASE WHEN origin."type"::text = 'AIRPORT' THEN FALSE ELSE TRUE END,
  "passengerCanEditDropoff" = CASE WHEN destination."type"::text = 'AIRPORT' THEN FALSE ELSE TRUE END,
  "flightTimeMode" = CASE WHEN destination."type"::text = 'AIRPORT' THEN 'DEPARTURE' ELSE 'ARRIVAL' END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ServiceRoute" AS route
JOIN "ServiceLocation" AS origin ON origin."id" = route."originId"
JOIN "ServiceLocation" AS destination ON destination."id" = route."destinationId"
WHERE policy."routeId" = route."id"
  AND (origin."type"::text = 'AIRPORT' OR destination."type"::text = 'AIRPORT');

-- Keep policy defaults synchronized if an administrator later changes a route's endpoints.
CREATE OR REPLACE FUNCTION create_default_route_booking_policy()
RETURNS TRIGGER AS $$
DECLARE
  origin_type TEXT;
  destination_type TEXT;
BEGIN
  SELECT "type"::text INTO origin_type FROM "ServiceLocation" WHERE "id" = NEW."originId";
  SELECT "type"::text INTO destination_type FROM "ServiceLocation" WHERE "id" = NEW."destinationId";

  INSERT INTO "RouteBookingPolicy" (
    "routeId",
    "passengerCanEditPickup",
    "passengerCanEditDropoff",
    "flightTimeMode"
  ) VALUES (
    NEW."id",
    origin_type <> 'AIRPORT',
    destination_type <> 'AIRPORT',
    CASE WHEN destination_type = 'AIRPORT' THEN 'DEPARTURE' ELSE 'ARRIVAL' END
  )
  ON CONFLICT ("routeId") DO UPDATE SET
    "passengerCanEditPickup" = EXCLUDED."passengerCanEditPickup",
    "passengerCanEditDropoff" = EXCLUDED."passengerCanEditDropoff",
    "flightTimeMode" = EXCLUDED."flightTimeMode",
    "updatedAt" = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_route_default_booking_policy ON "ServiceRoute";

CREATE TRIGGER service_route_default_booking_policy
AFTER INSERT OR UPDATE OF "originId", "destinationId" ON "ServiceRoute"
FOR EACH ROW
EXECUTE FUNCTION create_default_route_booking_policy();
