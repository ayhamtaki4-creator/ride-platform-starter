-- Per-trip route plan. This is intentionally separate from ServiceRoute so operations
-- can customize one booking without changing the shared route definition.
CREATE TABLE "TripRoutePlan" (
  "tripId" UUID NOT NULL,
  "geometry" JSONB NOT NULL,
  "waypoints" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "distanceKm" DOUBLE PRECISION,
  "durationMinutes" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "lockedAt" TIMESTAMP(3),
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripRoutePlan_pkey" PRIMARY KEY ("tripId")
);

CREATE TABLE "TripLiveLocation" (
  "tripId" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "speed" DOUBLE PRECISION,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripLiveLocation_pkey" PRIMARY KEY ("tripId")
);

CREATE TABLE "TripTrackingShare" (
  "id" UUID NOT NULL,
  "tripId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripTrackingShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripTrackingShare_tokenHash_key" ON "TripTrackingShare"("tokenHash");
CREATE INDEX "TripTrackingShare_tripId_expiresAt_idx" ON "TripTrackingShare"("tripId", "expiresAt");
CREATE INDEX "TripLiveLocation_driverId_recordedAt_idx" ON "TripLiveLocation"("driverId", "recordedAt");

ALTER TABLE "TripRoutePlan"
  ADD CONSTRAINT "TripRoutePlan_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TripRoutePlan_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TripLiveLocation"
  ADD CONSTRAINT "TripLiveLocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TripLiveLocation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TripTrackingShare"
  ADD CONSTRAINT "TripTrackingShare_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill all existing bookings with a safe straight-line plan. Operations can
-- replace this with routed road geometry before assignment.
INSERT INTO "TripRoutePlan" (
  "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes"
)
SELECT
  t."id",
  jsonb_build_object(
    'type', 'LineString',
    'coordinates', jsonb_build_array(
      jsonb_build_array(t."pickupLongitude", t."pickupLatitude"),
      jsonb_build_array(t."dropoffLongitude", t."dropoffLatitude")
    )
  ),
  '[]'::jsonb,
  t."estimatedDistanceKm",
  t."estimatedDurationMinutes"
FROM "Trip" t
ON CONFLICT ("tripId") DO NOTHING;

-- Existing assignments must be locked immediately as well.
UPDATE "TripRoutePlan" plan
SET "lockedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Trip" trip
WHERE plan."tripId" = trip."id"
  AND trip."driverId" IS NOT NULL;

CREATE OR REPLACE FUNCTION create_default_trip_route_plan()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "TripRoutePlan" (
    "tripId", "geometry", "waypoints", "distanceKm", "durationMinutes"
  ) VALUES (
    NEW."id",
    jsonb_build_object(
      'type', 'LineString',
      'coordinates', jsonb_build_array(
        jsonb_build_array(NEW."pickupLongitude", NEW."pickupLatitude"),
        jsonb_build_array(NEW."dropoffLongitude", NEW."dropoffLatitude")
      )
    ),
    '[]'::jsonb,
    NEW."estimatedDistanceKm",
    NEW."estimatedDurationMinutes"
  )
  ON CONFLICT ("tripId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Trip_create_default_route_plan"
AFTER INSERT ON "Trip"
FOR EACH ROW
EXECUTE FUNCTION create_default_trip_route_plan();

CREATE OR REPLACE FUNCTION lock_trip_route_plan_on_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."driverId" IS NULL AND NEW."driverId" IS NOT NULL THEN
    UPDATE "TripRoutePlan"
    SET "lockedAt" = COALESCE("lockedAt", CURRENT_TIMESTAMP),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tripId" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Trip_lock_route_plan_on_assignment"
AFTER UPDATE OF "driverId" ON "Trip"
FOR EACH ROW
EXECUTE FUNCTION lock_trip_route_plan_on_assignment();

CREATE OR REPLACE FUNCTION prevent_locked_trip_route_plan_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (
    NEW."geometry" IS DISTINCT FROM OLD."geometry" OR
    NEW."waypoints" IS DISTINCT FROM OLD."waypoints" OR
    NEW."distanceKm" IS DISTINCT FROM OLD."distanceKm" OR
    NEW."durationMinutes" IS DISTINCT FROM OLD."durationMinutes"
  ) THEN
    RAISE EXCEPTION 'Route plan is locked after driver assignment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TripRoutePlan_prevent_locked_changes"
BEFORE UPDATE ON "TripRoutePlan"
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_trip_route_plan_changes();
