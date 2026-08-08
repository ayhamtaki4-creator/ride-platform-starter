-- ServiceRouteTemplate is a reusable routing aid, not the source of truth for a booking's
-- passenger-selected endpoints. The API already applies RouteBookingPolicy before insert,
-- so the database must preserve the normalized pickup/dropoff values it receives.
DROP TRIGGER IF EXISTS "Trip_apply_service_route_template" ON "Trip";
DROP FUNCTION IF EXISTS apply_service_route_template_to_trip();

-- Keep the existing AFTER INSERT route-plan trigger, but only reuse a saved template's
-- geometry/waypoints when the booking endpoints still match the template endpoints.
-- If the passenger selected a custom non-airport endpoint, start the trip plan from the
-- actual booking endpoints instead of drawing the old generic city template.
CREATE OR REPLACE FUNCTION create_default_trip_route_plan()
RETURNS TRIGGER AS $$
DECLARE
  template "ServiceRouteTemplate"%ROWTYPE;
  endpoints_match BOOLEAN := FALSE;
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

  IF template."routeId" IS NOT NULL THEN
    endpoints_match :=
      ABS(NEW."pickupLatitude" - template."originLatitude") <= 0.000001
      AND ABS(NEW."pickupLongitude" - template."originLongitude") <= 0.000001
      AND ABS(NEW."dropoffLatitude" - template."destinationLatitude") <= 0.000001
      AND ABS(NEW."dropoffLongitude" - template."destinationLongitude") <= 0.000001;
  END IF;

  selected_geometry := CASE
    WHEN endpoints_match AND template."geometry" IS NOT NULL THEN template."geometry"
    ELSE jsonb_build_object(
      'type', 'LineString',
      'coordinates', jsonb_build_array(
        jsonb_build_array(NEW."pickupLongitude", NEW."pickupLatitude"),
        jsonb_build_array(NEW."dropoffLongitude", NEW."dropoffLatitude")
      )
    )
  END;

  selected_waypoints := CASE
    WHEN endpoints_match THEN COALESCE(template."waypoints", '[]'::jsonb)
    ELSE '[]'::jsonb
  END;

  selected_distance := CASE
    WHEN endpoints_match THEN COALESCE(template."distanceKm", NEW."estimatedDistanceKm")
    ELSE NEW."estimatedDistanceKm"
  END;

  selected_duration := CASE
    WHEN endpoints_match THEN COALESCE(template."durationMinutes", NEW."estimatedDurationMinutes")
    ELSE NEW."estimatedDurationMinutes"
  END;

  INSERT INTO "TripRoutePlan" (
    "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes"
  ) VALUES (
    NEW."id", selected_geometry, selected_waypoints, selected_distance, selected_duration
  )
  ON CONFLICT ("tripId") DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
