BEGIN;

-- Two private-car fare tiers are required because the family-car fare is selected
-- automatically when passengers > 4 OR luggage > 6.
DO $migration$
BEGIN
  CREATE TYPE "VehicleClass" AS ENUM ('STANDARD', 'FAMILY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$migration$;

ALTER TABLE "PricingRule"
  ADD COLUMN IF NOT EXISTS "vehicleClass" "VehicleClass";

UPDATE "PricingRule"
SET "vehicleClass" = 'STANDARD'
WHERE "vehicleClass" IS NULL;

ALTER TABLE "PricingRule"
  ALTER COLUMN "vehicleClass" SET DEFAULT 'STANDARD',
  ALTER COLUMN "vehicleClass" SET NOT NULL;

DROP INDEX IF EXISTS "PricingRule_scopeKey_bookingType_key";
DROP INDEX IF EXISTS "PricingRule_isActive_routeId_bookingType_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "PricingRule_scopeKey_bookingType_vehicleClass_key"
  ON "PricingRule"("scopeKey", "bookingType", "vehicleClass");

CREATE INDEX IF NOT EXISTS "PricingRule_isActive_routeId_bookingType_vehicleClass_idx"
  ON "PricingRule"("isActive", "routeId", "bookingType", "vehicleClass");

-- All helper functions live only for this database session. They deliberately
-- resolve both unique route keys (code and origin/destination) so mock data with
-- an older code is updated rather than duplicated.
CREATE OR REPLACE FUNCTION pg_temp.upsert_region(
  p_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT,
  p_country_code TEXT,
  p_kind TEXT
) RETURNS UUID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO "ServiceRegion" (
    "id", "code", "nameAr", "nameEn", "countryCode", "kind",
    "isActive", "createdAt", "updatedAt"
  ) VALUES (
    gen_random_uuid(), p_code, p_name_ar, p_name_en, p_country_code,
    p_kind::"RegionKind", TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("code") DO UPDATE SET
    "nameAr" = EXCLUDED."nameAr",
    "nameEn" = EXCLUDED."nameEn",
    "countryCode" = EXCLUDED."countryCode",
    "kind" = EXCLUDED."kind",
    "isActive" = TRUE,
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "id" INTO v_id;

  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.upsert_location(
  p_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT,
  p_type TEXT,
  p_country_code TEXT,
  p_city TEXT,
  p_governorate TEXT,
  p_latitude NUMERIC,
  p_longitude NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO "ServiceLocation" (
    "id", "code", "nameAr", "nameEn", "type", "countryCode", "city",
    "governorate", "latitude", "longitude", "isActive", "createdAt", "updatedAt"
  ) VALUES (
    gen_random_uuid(), p_code, p_name_ar, p_name_en, p_type::"LocationType",
    p_country_code, p_city, p_governorate, p_latitude, p_longitude,
    TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("code") DO UPDATE SET
    "nameAr" = EXCLUDED."nameAr",
    "nameEn" = EXCLUDED."nameEn",
    "type" = EXCLUDED."type",
    "countryCode" = EXCLUDED."countryCode",
    "city" = COALESCE(EXCLUDED."city", "ServiceLocation"."city"),
    "governorate" = COALESCE(EXCLUDED."governorate", "ServiceLocation"."governorate"),
    "latitude" = COALESCE(EXCLUDED."latitude", "ServiceLocation"."latitude"),
    "longitude" = COALESCE(EXCLUDED."longitude", "ServiceLocation"."longitude"),
    "isActive" = TRUE,
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "id" INTO v_id;

  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.upsert_route(
  p_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT,
  p_origin_code TEXT,
  p_destination_code TEXT,
  p_route_type TEXT,
  p_requires_flight_details BOOLEAN,
  p_estimated_minutes INTEGER,
  p_distance_km NUMERIC,
  p_region_codes TEXT[]
) RETURNS UUID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_origin_id UUID;
  v_destination_id UUID;
  v_route_id UUID;
  v_current_code TEXT;
  v_region_count INTEGER;
BEGIN
  SELECT "id" INTO v_origin_id
  FROM "ServiceLocation"
  WHERE "code" = p_origin_code;

  SELECT "id" INTO v_destination_id
  FROM "ServiceLocation"
  WHERE "code" = p_destination_code;

  IF v_origin_id IS NULL OR v_destination_id IS NULL THEN
    RAISE EXCEPTION 'Missing route location: % -> %', p_origin_code, p_destination_code;
  END IF;

  SELECT COUNT(DISTINCT "code") INTO v_region_count
  FROM "ServiceRegion"
  WHERE "code" = ANY(p_region_codes);

  IF v_region_count <> cardinality(p_region_codes) THEN
    RAISE EXCEPTION 'A required region is missing for route %', p_code;
  END IF;

  SELECT "id", "code" INTO v_route_id, v_current_code
  FROM "ServiceRoute"
  WHERE "originId" = v_origin_id AND "destinationId" = v_destination_id
  FOR UPDATE;

  IF v_route_id IS NULL THEN
    SELECT "id", "code" INTO v_route_id, v_current_code
    FROM "ServiceRoute"
    WHERE "code" = p_code
    FOR UPDATE;
  END IF;

  IF v_route_id IS NULL THEN
    INSERT INTO "ServiceRoute" (
      "id", "code", "nameAr", "nameEn", "originId", "destinationId",
      "routeType", "requiresFlightDetails", "estimatedMinutes", "distanceKm",
      "isActive", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), p_code, p_name_ar, p_name_en, v_origin_id, v_destination_id,
      p_route_type::"RouteType", p_requires_flight_details, p_estimated_minutes,
      p_distance_km, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING "id" INTO v_route_id;
  ELSE
    -- Keep an existing code only when the desired code belongs to another mock
    -- route. This avoids violating either unique constraint and preserves data.
    IF v_current_code <> p_code
       AND NOT EXISTS (
         SELECT 1 FROM "ServiceRoute"
         WHERE "code" = p_code AND "id" <> v_route_id
       ) THEN
      v_current_code := p_code;
    END IF;

    UPDATE "ServiceRoute" SET
      "code" = v_current_code,
      "nameAr" = p_name_ar,
      "nameEn" = p_name_en,
      "originId" = v_origin_id,
      "destinationId" = v_destination_id,
      "routeType" = p_route_type::"RouteType",
      "requiresFlightDetails" = p_requires_flight_details,
      "estimatedMinutes" = COALESCE(p_estimated_minutes, "estimatedMinutes"),
      "distanceKm" = COALESCE(p_distance_km, "distanceKm"),
      "isActive" = TRUE,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = v_route_id;
  END IF;

  DELETE FROM "RouteRequiredRegion" rr
  USING "ServiceRegion" region
  WHERE rr."routeId" = v_route_id
    AND rr."regionId" = region."id"
    AND NOT (region."code" = ANY(p_region_codes));

  INSERT INTO "RouteRequiredRegion" ("routeId", "regionId")
  SELECT v_route_id, "id"
  FROM "ServiceRegion"
  WHERE "code" = ANY(p_region_codes)
  ON CONFLICT ("routeId", "regionId") DO NOTHING;

  RETURN v_route_id;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.upsert_private_price(
  p_route_id UUID,
  p_vehicle_class TEXT,
  p_passenger_price NUMERIC,
  p_driver_fee NUMERIC,
  p_platform_margin NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_scope_key TEXT := 'ROUTE:' || p_route_id::TEXT;
  v_rule_id UUID;
  v_direction "BookingDirection";
BEGIN
  IF ABS(p_passenger_price - p_driver_fee - p_platform_margin) > 0.001 THEN
    RAISE EXCEPTION 'Invalid fare split for route % and class %', p_route_id, p_vehicle_class;
  END IF;

  SELECT CASE
    WHEN origin."code" = 'BEIRUT_AIRPORT' AND destination."code" = 'DAMASCUS'
      THEN 'BEIRUT_AIRPORT_TO_DAMASCUS'::"BookingDirection"
    WHEN origin."code" = 'DAMASCUS' AND destination."code" = 'BEIRUT_AIRPORT'
      THEN 'DAMASCUS_TO_BEIRUT_AIRPORT'::"BookingDirection"
    ELSE NULL
  END INTO v_direction
  FROM "ServiceRoute" route
  JOIN "ServiceLocation" origin ON origin."id" = route."originId"
  JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
  WHERE route."id" = p_route_id;

  SELECT "id" INTO v_rule_id
  FROM "PricingRule"
  WHERE "bookingType" = 'PRIVATE_CAR'
    AND "vehicleClass" = p_vehicle_class::"VehicleClass"
    AND ("scopeKey" = v_scope_key OR "routeId" = p_route_id)
  ORDER BY ("scopeKey" = v_scope_key) DESC, ("routeId" = p_route_id) DESC, "updatedAt" DESC
  LIMIT 1
  FOR UPDATE;

  IF v_rule_id IS NULL THEN
    INSERT INTO "PricingRule" (
      "id", "scopeKey", "direction", "routeId", "bookingType", "vehicleClass",
      "passengerPrice", "driverFee", "platformMargin", "currency", "isActive",
      "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), v_scope_key, v_direction, p_route_id, 'PRIVATE_CAR',
      p_vehicle_class::"VehicleClass", p_passenger_price, p_driver_fee,
      p_platform_margin, 'USD', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  ELSE
    UPDATE "PricingRule" SET
      "scopeKey" = v_scope_key,
      "direction" = v_direction,
      "routeId" = p_route_id,
      "bookingType" = 'PRIVATE_CAR',
      "vehicleClass" = p_vehicle_class::"VehicleClass",
      "passengerPrice" = p_passenger_price,
      "driverFee" = p_driver_fee,
      "platformMargin" = p_platform_margin,
      "currency" = 'USD',
      "isActive" = TRUE,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = v_rule_id;

    UPDATE "PricingRule" SET
      "isActive" = FALSE,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" <> v_rule_id
      AND "routeId" = p_route_id
      AND "bookingType" = 'PRIVATE_CAR'
      AND "vehicleClass" = p_vehicle_class::"VehicleClass";
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.set_private_fares(
  p_route_id UUID,
  p_standard_price NUMERIC,
  p_standard_driver_fee NUMERIC,
  p_standard_margin NUMERIC,
  p_family_price NUMERIC,
  p_family_driver_fee NUMERIC,
  p_family_margin NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_temp.upsert_private_price(
    p_route_id, 'STANDARD', p_standard_price, p_standard_driver_fee, p_standard_margin
  );
  PERFORM pg_temp.upsert_private_price(
    p_route_id, 'FAMILY', p_family_price, p_family_driver_fee, p_family_margin
  );

  -- These business routes are sold as complete cars, not per-seat bookings.
  UPDATE "PricingRule" SET
    "isActive" = FALSE,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "routeId" = p_route_id
    AND "bookingType" = 'SHARED_SEAT'
    AND "isActive" = TRUE;
END
$function$;

-- Required operating regions.
SELECT pg_temp.upsert_region('SYRIA', 'سوريا', 'Syria', 'SY', 'COUNTRY_ACCESS');
SELECT pg_temp.upsert_region('LEBANON', 'لبنان', 'Lebanon', 'LB', 'COUNTRY_ACCESS');
SELECT pg_temp.upsert_region('JORDAN', 'الأردن', 'Jordan', 'JO', 'COUNTRY_ACCESS');

-- Required locations. Null coordinates never overwrite useful existing values.
SELECT pg_temp.upsert_location('DAMASCUS', 'دمشق', 'Damascus', 'CITY', 'SY', 'دمشق', NULL, 33.5138, 36.2765);
SELECT pg_temp.upsert_location('DAMASCUS_AIRPORT', 'مطار دمشق الدولي', 'Damascus International Airport', 'AIRPORT', 'SY', 'دمشق', NULL, NULL, NULL);
SELECT pg_temp.upsert_location('BEIRUT', 'بيروت', 'Beirut', 'CITY', 'LB', 'بيروت', NULL, 33.8938, 35.5018);
SELECT pg_temp.upsert_location('BEIRUT_AIRPORT', 'مطار بيروت الدولي', 'Beirut-Rafic Hariri International Airport', 'AIRPORT', 'LB', 'بيروت', NULL, 33.8209, 35.4884);
SELECT pg_temp.upsert_location('AMMAN', 'عمّان', 'Amman', 'CITY', 'JO', 'عمّان', NULL, 31.9539, 35.9106);

SELECT pg_temp.upsert_location('ALEPPO', 'حلب', 'Aleppo', 'GOVERNORATE', 'SY', NULL, 'حلب', NULL, NULL);
SELECT pg_temp.upsert_location('HOMS', 'حمص', 'Homs', 'GOVERNORATE', 'SY', NULL, 'حمص', NULL, NULL);
SELECT pg_temp.upsert_location('HAMA', 'حماة', 'Hama', 'GOVERNORATE', 'SY', NULL, 'حماة', NULL, NULL);
SELECT pg_temp.upsert_location('LATAKIA', 'اللاذقية', 'Latakia', 'GOVERNORATE', 'SY', NULL, 'اللاذقية', NULL, NULL);
SELECT pg_temp.upsert_location('TARTUS', 'طرطوس', 'Tartus', 'GOVERNORATE', 'SY', NULL, 'طرطوس', NULL, NULL);
SELECT pg_temp.upsert_location('DARAA', 'درعا', 'Daraa', 'GOVERNORATE', 'SY', NULL, 'درعا', NULL, NULL);
SELECT pg_temp.upsert_location('AS_SUWAYDA', 'السويداء', 'As-Suwayda', 'GOVERNORATE', 'SY', NULL, 'السويداء', NULL, NULL);
SELECT pg_temp.upsert_location('QUNEITRA', 'القنيطرة', 'Quneitra', 'GOVERNORATE', 'SY', NULL, 'القنيطرة', NULL, NULL);
SELECT pg_temp.upsert_location('IDLIB', 'إدلب', 'Idlib', 'GOVERNORATE', 'SY', NULL, 'إدلب', NULL, NULL);
SELECT pg_temp.upsert_location('DEIR_EZ_ZOR', 'دير الزور', 'Deir ez-Zor', 'GOVERNORATE', 'SY', NULL, 'دير الزور', NULL, NULL);
SELECT pg_temp.upsert_location('RAQQA', 'الرقة', 'Raqqa', 'GOVERNORATE', 'SY', NULL, 'الرقة', NULL, NULL);
SELECT pg_temp.upsert_location('HASAKAH', 'الحسكة', 'Al-Hasakah', 'GOVERNORATE', 'SY', NULL, 'الحسكة', NULL, NULL);

-- Damascus <-> every Syrian governorate except Rif Dimashq: USD 100 = 90 + 10.
-- The family tier intentionally has the same price because no family surcharge
-- was specified for these domestic routes.
DO $routes$
DECLARE
  item RECORD;
  v_route_id UUID;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('ALEPPO', 'حلب', 'Aleppo'),
      ('HOMS', 'حمص', 'Homs'),
      ('HAMA', 'حماة', 'Hama'),
      ('LATAKIA', 'اللاذقية', 'Latakia'),
      ('TARTUS', 'طرطوس', 'Tartus'),
      ('DARAA', 'درعا', 'Daraa'),
      ('AS_SUWAYDA', 'السويداء', 'As-Suwayda'),
      ('QUNEITRA', 'القنيطرة', 'Quneitra'),
      ('IDLIB', 'إدلب', 'Idlib'),
      ('DEIR_EZ_ZOR', 'دير الزور', 'Deir ez-Zor'),
      ('RAQQA', 'الرقة', 'Raqqa'),
      ('HASAKAH', 'الحسكة', 'Al-Hasakah')
    ) AS governorates(code, name_ar, name_en)
  LOOP
    v_route_id := pg_temp.upsert_route(
      'DAM-' || item.code,
      'دمشق إلى ' || item.name_ar,
      'Damascus to ' || item.name_en,
      'DAMASCUS', item.code, 'INTERCITY', FALSE, NULL, NULL, ARRAY['SYRIA']
    );
    PERFORM pg_temp.set_private_fares(v_route_id, 100, 90, 10, 100, 90, 10);

    v_route_id := pg_temp.upsert_route(
      item.code || '-DAM',
      item.name_ar || ' إلى دمشق',
      item.name_en || ' to Damascus',
      item.code, 'DAMASCUS', 'INTERCITY', FALSE, NULL, NULL, ARRAY['SYRIA']
    );
    PERFORM pg_temp.set_private_fares(v_route_id, 100, 90, 10, 100, 90, 10);
  END LOOP;
END
$routes$;

-- Damascus <-> Beirut city and Beirut airport, both at the same fare.
DO $routes$
DECLARE
  v_route_id UUID;
BEGIN
  v_route_id := pg_temp.upsert_route(
    'DAM-BEY', 'دمشق إلى بيروت', 'Damascus to Beirut',
    'DAMASCUS', 'BEIRUT', 'INTERNATIONAL', FALSE, 150, 115, ARRAY['SYRIA', 'LEBANON']
  );
  PERFORM pg_temp.set_private_fares(v_route_id, 100, 80, 20, 150, 130, 20);

  v_route_id := pg_temp.upsert_route(
    'BEY-DAM', 'بيروت إلى دمشق', 'Beirut to Damascus',
    'BEIRUT', 'DAMASCUS', 'INTERNATIONAL', FALSE, 150, 115, ARRAY['LEBANON', 'SYRIA']
  );
  PERFORM pg_temp.set_private_fares(v_route_id, 100, 80, 20, 150, 130, 20);

  v_route_id := pg_temp.upsert_route(
    'DAM-BEY-AIRPORT', 'دمشق إلى مطار بيروت', 'Damascus to Beirut Airport',
    'DAMASCUS', 'BEIRUT_AIRPORT', 'INTERNATIONAL', TRUE, 150, 115, ARRAY['SYRIA', 'LEBANON']
  );
  PERFORM pg_temp.set_private_fares(v_route_id, 100, 80, 20, 150, 130, 20);

  v_route_id := pg_temp.upsert_route(
    'BEY-AIRPORT-DAM', 'مطار بيروت إلى دمشق', 'Beirut Airport to Damascus',
    'BEIRUT_AIRPORT', 'DAMASCUS', 'INTERNATIONAL', TRUE, 150, 115, ARRAY['LEBANON', 'SYRIA']
  );
  PERFORM pg_temp.set_private_fares(v_route_id, 100, 80, 20, 150, 130, 20);
END
$routes$;

-- Damascus <-> Amman.
DO $routes$
DECLARE
  v_route_id UUID;
BEGIN
  v_route_id := pg_temp.upsert_route(
    'DAM-AMM', 'دمشق إلى عمّان', 'Damascus to Amman',
    'DAMASCUS', 'AMMAN', 'INTERNATIONAL', FALSE, NULL, NULL, ARRAY['SYRIA', 'JORDAN']
  );
  PERFORM pg_temp.set_private_fares(v_route_id, 150, 130, 20, 200, 180, 20);

  v_route_id := pg_temp.upsert_route(
    'AMM-DAM', 'عمّان إلى دمشق', 'Amman to Damascus',
    'AMMAN', 'DAMASCUS', 'INTERNATIONAL', FALSE, NULL, NULL, ARRAY['JORDAN', 'SYRIA']
  );
  PERFORM pg_temp.set_private_fares(v_route_id, 150, 130, 20, 200, 180, 20);
END
$routes$;

-- Damascus airport -> Damascus city.
DO $routes$
DECLARE
  v_route_id UUID;
BEGIN
  v_route_id := pg_temp.upsert_route(
    'DAM-AIRPORT-DAM', 'مطار دمشق إلى مدينة دمشق', 'Damascus Airport to Damascus',
    'DAMASCUS_AIRPORT', 'DAMASCUS', 'AIRPORT_TRANSFER', TRUE, NULL, NULL, ARRAY['SYRIA']
  );
  PERFORM pg_temp.set_private_fares(v_route_id, 40, 30, 10, 50, 40, 10);
END
$routes$;

COMMIT;
