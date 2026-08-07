-- Saved route templates let operations define exact endpoints and a reusable road path
-- for each ServiceRoute. New bookings copy this template automatically, while each
-- booking can still be customized later through TripRoutePlan.
CREATE TABLE "ServiceRouteTemplate" (
  "routeId" UUID NOT NULL,
  "originAddress" TEXT NOT NULL,
  "originLatitude" DOUBLE PRECISION NOT NULL,
  "originLongitude" DOUBLE PRECISION NOT NULL,
  "destinationAddress" TEXT NOT NULL,
  "destinationLatitude" DOUBLE PRECISION NOT NULL,
  "destinationLongitude" DOUBLE PRECISION NOT NULL,
  "geometry" JSONB,
  "waypoints" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "distanceKm" DOUBLE PRECISION,
  "durationMinutes" INTEGER,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRouteTemplate_pkey" PRIMARY KEY ("routeId")
);

ALTER TABLE "ServiceRouteTemplate"
  ADD CONSTRAINT "ServiceRouteTemplate_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ServiceRouteTemplate_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRouteTemplate"
  ADD CONSTRAINT "ServiceRouteTemplate_originLatitude_check" CHECK ("originLatitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "ServiceRouteTemplate_originLongitude_check" CHECK ("originLongitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "ServiceRouteTemplate_destinationLatitude_check" CHECK ("destinationLatitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "ServiceRouteTemplate_destinationLongitude_check" CHECK ("destinationLongitude" BETWEEN -180 AND 180);

-- Backfill templates for routes whose ServiceLocation coordinates are already valid.
INSERT INTO "ServiceRouteTemplate" (
  "routeId",
  "originAddress", "originLatitude", "originLongitude",
  "destinationAddress", "destinationLatitude", "destinationLongitude",
  "geometry", "waypoints", "distanceKm", "durationMinutes"
)
SELECT
  r."id",
  o."nameAr", o."latitude"::double precision, o."longitude"::double precision,
  d."nameAr", d."latitude"::double precision, d."longitude"::double precision,
  jsonb_build_object(
    'type', 'LineString',
    'coordinates', jsonb_build_array(
      jsonb_build_array(o."longitude"::double precision, o."latitude"::double precision),
      jsonb_build_array(d."longitude"::double precision, d."latitude"::double precision)
    )
  ),
  '[]'::jsonb,
  r."distanceKm"::double precision,
  r."estimatedMinutes"
FROM "ServiceRoute" r
JOIN "ServiceLocation" o ON o."id" = r."originId"
JOIN "ServiceLocation" d ON d."id" = r."destinationId"
WHERE o."latitude" IS NOT NULL AND o."longitude" IS NOT NULL
  AND d."latitude" IS NOT NULL AND d."longitude" IS NOT NULL
ON CONFLICT ("routeId") DO NOTHING;

-- Every newly submitted booking on a templated route receives the exact saved
-- endpoint addresses/coordinates and route estimates, regardless of client input.
CREATE OR REPLACE FUNCTION apply_service_route_template_to_trip()
RETURNS TRIGGER AS $$
DECLARE
  template "ServiceRouteTemplate"%ROWTYPE;
BEGIN
  IF NEW."routeId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO template
  FROM "ServiceRouteTemplate"
  WHERE "routeId" = NEW."routeId";

  IF FOUND THEN
    NEW."pickupAddress" := template."originAddress";
    NEW."pickupLatitude" := template."originLatitude";
    NEW."pickupLongitude" := template."originLongitude";
    NEW."dropoffAddress" := template."destinationAddress";
    NEW."dropoffLatitude" := template."destinationLatitude";
    NEW."dropoffLongitude" := template."destinationLongitude";
    NEW."estimatedDistanceKm" := COALESCE(template."distanceKm", NEW."estimatedDistanceKm");
    NEW."estimatedDurationMinutes" := COALESCE(template."durationMinutes", NEW."estimatedDurationMinutes");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Trip_apply_service_route_template" ON "Trip";
CREATE TRIGGER "Trip_apply_service_route_template"
BEFORE INSERT ON "Trip"
FOR EACH ROW
EXECUTE FUNCTION apply_service_route_template_to_trip();

-- Update the TripRoutePlan creation trigger so a saved ServiceRoute template is
-- copied to the booking instead of starting from a straight line.
CREATE OR REPLACE FUNCTION create_default_trip_route_plan()
RETURNS TRIGGER AS $$
DECLARE
  template "ServiceRouteTemplate"%ROWTYPE;
  selected_geometry JSONB;
  selected_waypoints JSONB;
  selected_distance DOUBLE PRECISION;
  selected_duration INTEGER;
BEGIN
  IF NEW."routeId" IS NOT NULL THEN
    SELECT * INTO template
    FROM "ServiceRouteTemplate"
    WHERE "routeId" = NEW."routeId";
  END IF;

  selected_geometry := CASE
    WHEN template."routeId" IS NOT NULL AND template."geometry" IS NOT NULL THEN template."geometry"
    ELSE jsonb_build_object(
      'type', 'LineString',
      'coordinates', jsonb_build_array(
        jsonb_build_array(NEW."pickupLongitude", NEW."pickupLatitude"),
        jsonb_build_array(NEW."dropoffLongitude", NEW."dropoffLatitude")
      )
    )
  END;
  selected_waypoints := CASE
    WHEN template."routeId" IS NOT NULL THEN COALESCE(template."waypoints", '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
  selected_distance := COALESCE(template."distanceKm", NEW."estimatedDistanceKm");
  selected_duration := COALESCE(template."durationMinutes", NEW."estimatedDurationMinutes");

  INSERT INTO "TripRoutePlan" (
    "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes"
  ) VALUES (
    NEW."id", selected_geometry, selected_waypoints, selected_distance, selected_duration
  )
  ON CONFLICT ("tripId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
