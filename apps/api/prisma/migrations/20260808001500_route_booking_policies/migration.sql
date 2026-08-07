CREATE TABLE "RouteBookingPolicy" (
  "routeId" UUID NOT NULL,
  "passengerCanEditPickup" BOOLEAN NOT NULL DEFAULT TRUE,
  "passengerCanEditDropoff" BOOLEAN NOT NULL DEFAULT TRUE,
  "flightTimeMode" TEXT NOT NULL DEFAULT 'ARRIVAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteBookingPolicy_pkey" PRIMARY KEY ("routeId"),
  CONSTRAINT "RouteBookingPolicy_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RouteBookingPolicy_flightTimeMode_check" CHECK ("flightTimeMode" IN ('ARRIVAL', 'DEPARTURE'))
);

INSERT INTO "RouteBookingPolicy" (
  "routeId",
  "passengerCanEditPickup",
  "passengerCanEditDropoff",
  "flightTimeMode"
)
SELECT
  route."id",
  CASE WHEN origin."type"::text = 'AIRPORT' THEN FALSE ELSE TRUE END,
  CASE WHEN destination."type"::text = 'AIRPORT' THEN FALSE ELSE TRUE END,
  CASE
    WHEN destination."type"::text = 'AIRPORT' THEN 'DEPARTURE'
    ELSE 'ARRIVAL'
  END
FROM "ServiceRoute" route
JOIN "ServiceLocation" origin ON origin."id" = route."originId"
JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
ON CONFLICT ("routeId") DO NOTHING;

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
  ON CONFLICT ("routeId") DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_route_default_booking_policy
AFTER INSERT ON "ServiceRoute"
FOR EACH ROW
EXECUTE FUNCTION create_default_route_booking_policy();