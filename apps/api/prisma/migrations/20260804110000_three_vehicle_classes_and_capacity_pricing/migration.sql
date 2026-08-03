-- Replace the former STANDARD/FAMILY split with three explicit vehicle classes.
-- Existing rule ids are preserved so bookings that reference them remain valid:
-- STANDARD -> SMALL, FAMILY -> LARGE, and MEDIUM is inserted as a new rule.

BEGIN;

DO $enum_migration$
DECLARE
  has_legacy_values BOOLEAN;
  new_value_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_enum enum_value ON enum_value.enumtypid = type.oid
    WHERE namespace.nspname = current_schema()
      AND type.typname = 'VehicleClass'
      AND enum_value.enumlabel IN ('STANDARD', 'FAMILY')
  ) INTO has_legacy_values;

  IF has_legacy_values THEN
    EXECUTE 'CREATE TYPE "VehicleClass_three_tier" AS ENUM (''SMALL'', ''MEDIUM'', ''LARGE'')';
    EXECUTE 'ALTER TABLE "PricingRule" ALTER COLUMN "vehicleClass" DROP DEFAULT';
    EXECUTE $sql$
      ALTER TABLE "PricingRule"
      ALTER COLUMN "vehicleClass" TYPE "VehicleClass_three_tier"
      USING (
        CASE "vehicleClass"::TEXT
          WHEN 'STANDARD' THEN 'SMALL'
          WHEN 'FAMILY' THEN 'LARGE'
          WHEN 'SMALL' THEN 'SMALL'
          WHEN 'MEDIUM' THEN 'MEDIUM'
          WHEN 'LARGE' THEN 'LARGE'
          ELSE 'SMALL'
        END
      )::"VehicleClass_three_tier"
    $sql$;
    EXECUTE 'DROP TYPE "VehicleClass"';
    EXECUTE 'ALTER TYPE "VehicleClass_three_tier" RENAME TO "VehicleClass"';
    EXECUTE 'ALTER TABLE "PricingRule" ALTER COLUMN "vehicleClass" SET DEFAULT ''SMALL''::"VehicleClass"';
  ELSE
    SELECT COUNT(DISTINCT enum_value.enumlabel)
    INTO new_value_count
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_enum enum_value ON enum_value.enumtypid = type.oid
    WHERE namespace.nspname = current_schema()
      AND type.typname = 'VehicleClass'
      AND enum_value.enumlabel IN ('SMALL', 'MEDIUM', 'LARGE');

    IF new_value_count <> 3 THEN
      RAISE EXCEPTION 'VehicleClass must contain SMALL, MEDIUM, and LARGE';
    END IF;
  END IF;
END
$enum_migration$;

CREATE OR REPLACE FUNCTION pg_temp.upsert_three_tier_private_price(
  p_route_id UUID,
  p_vehicle_class "VehicleClass",
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
  WHERE "routeId" = p_route_id
    AND "bookingType" = 'PRIVATE_CAR'
    AND "vehicleClass" = p_vehicle_class
  ORDER BY ("scopeKey" = v_scope_key) DESC, "updatedAt" DESC
  LIMIT 1
  FOR UPDATE;

  IF v_rule_id IS NULL THEN
    INSERT INTO "PricingRule" (
      "id", "scopeKey", "direction", "routeId", "bookingType", "vehicleClass",
      "passengerPrice", "driverFee", "platformMargin", "currency", "isActive",
      "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), v_scope_key, v_direction, p_route_id, 'PRIVATE_CAR',
      p_vehicle_class, p_passenger_price, p_driver_fee, p_platform_margin,
      'USD', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  ELSE
    UPDATE "PricingRule" SET
      "scopeKey" = v_scope_key,
      "direction" = v_direction,
      "routeId" = p_route_id,
      "bookingType" = 'PRIVATE_CAR',
      "vehicleClass" = p_vehicle_class,
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
      AND "vehicleClass" = p_vehicle_class;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.set_three_tier_private_fares(
  p_route_id UUID,
  p_small_price NUMERIC,
  p_small_driver_fee NUMERIC,
  p_small_margin NUMERIC,
  p_medium_price NUMERIC,
  p_medium_driver_fee NUMERIC,
  p_medium_margin NUMERIC,
  p_large_price NUMERIC,
  p_large_driver_fee NUMERIC,
  p_large_margin NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_temp.upsert_three_tier_private_price(
    p_route_id, 'SMALL', p_small_price, p_small_driver_fee, p_small_margin
  );
  PERFORM pg_temp.upsert_three_tier_private_price(
    p_route_id, 'MEDIUM', p_medium_price, p_medium_driver_fee, p_medium_margin
  );
  PERFORM pg_temp.upsert_three_tier_private_price(
    p_route_id, 'LARGE', p_large_price, p_large_driver_fee, p_large_margin
  );

  -- These routes are sold as complete cars. Keep any old per-seat rule disabled.
  UPDATE "PricingRule" SET
    "isActive" = FALSE,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "routeId" = p_route_id
    AND "bookingType" = 'SHARED_SEAT'
    AND "isActive" = TRUE;
END
$function$;

-- Damascus <-> Syrian governorates except Rif Dimashq: all classes USD 100 = 90 + 10.
DO $domestic_routes$
DECLARE
  v_route_id UUID;
BEGIN
  FOR v_route_id IN
    SELECT route."id"
    FROM "ServiceRoute" route
    JOIN "ServiceLocation" origin ON origin."id" = route."originId"
    JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
    WHERE (
      origin."code" = 'DAMASCUS'
      AND destination."code" = ANY(ARRAY[
        'ALEPPO', 'HOMS', 'HAMA', 'LATAKIA', 'TARTUS', 'DARAA',
        'AS_SUWAYDA', 'QUNEITRA', 'IDLIB', 'DEIR_EZ_ZOR', 'RAQQA', 'HASAKAH'
      ])
    ) OR (
      destination."code" = 'DAMASCUS'
      AND origin."code" = ANY(ARRAY[
        'ALEPPO', 'HOMS', 'HAMA', 'LATAKIA', 'TARTUS', 'DARAA',
        'AS_SUWAYDA', 'QUNEITRA', 'IDLIB', 'DEIR_EZ_ZOR', 'RAQQA', 'HASAKAH'
      ])
    )
  LOOP
    PERFORM pg_temp.set_three_tier_private_fares(
      v_route_id, 100, 90, 10, 100, 90, 10, 100, 90, 10
    );
  END LOOP;
END
$domestic_routes$;

-- Damascus <-> Beirut city and Beirut airport: 100 / 125 / 150.
DO $beirut_routes$
DECLARE
  v_route_id UUID;
BEGIN
  FOR v_route_id IN
    SELECT route."id"
    FROM "ServiceRoute" route
    JOIN "ServiceLocation" origin ON origin."id" = route."originId"
    JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
    WHERE (
      origin."code" = 'DAMASCUS'
      AND destination."code" = ANY(ARRAY['BEIRUT', 'BEIRUT_AIRPORT'])
    ) OR (
      destination."code" = 'DAMASCUS'
      AND origin."code" = ANY(ARRAY['BEIRUT', 'BEIRUT_AIRPORT'])
    )
  LOOP
    PERFORM pg_temp.set_three_tier_private_fares(
      v_route_id, 100, 80, 20, 125, 105, 20, 150, 130, 20
    );
  END LOOP;
END
$beirut_routes$;

-- Damascus <-> Amman: 150 / 175 / 200.
DO $amman_routes$
DECLARE
  v_route_id UUID;
BEGIN
  FOR v_route_id IN
    SELECT route."id"
    FROM "ServiceRoute" route
    JOIN "ServiceLocation" origin ON origin."id" = route."originId"
    JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
    WHERE (origin."code" = 'DAMASCUS' AND destination."code" = 'AMMAN')
       OR (origin."code" = 'AMMAN' AND destination."code" = 'DAMASCUS')
  LOOP
    PERFORM pg_temp.set_three_tier_private_fares(
      v_route_id, 150, 130, 20, 175, 155, 20, 200, 180, 20
    );
  END LOOP;
END
$amman_routes$;

-- Damascus airport -> Damascus city: 40 / 45 / 50.
DO $damascus_airport_route$
DECLARE
  v_route_id UUID;
BEGIN
  FOR v_route_id IN
    SELECT route."id"
    FROM "ServiceRoute" route
    JOIN "ServiceLocation" origin ON origin."id" = route."originId"
    JOIN "ServiceLocation" destination ON destination."id" = route."destinationId"
    WHERE origin."code" = 'DAMASCUS_AIRPORT'
      AND destination."code" = 'DAMASCUS'
  LOOP
    PERFORM pg_temp.set_three_tier_private_fares(
      v_route_id, 40, 30, 10, 45, 35, 10, 50, 40, 10
    );
  END LOOP;
END
$damascus_airport_route$;

COMMIT;
