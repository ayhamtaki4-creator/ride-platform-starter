CREATE TYPE "LocationType" AS ENUM (
  'CITY',
  'AIRPORT',
  'GOVERNORATE',
  'BORDER',
  'STATION'
);

CREATE TYPE "RouteType" AS ENUM (
  'INTERCITY',
  'INTERNATIONAL',
  'AIRPORT_TRANSFER',
  'PRIVATE_TRANSFER'
);

CREATE TYPE "AccessStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'EXPIRED',
  'SUSPENDED',
  'REJECTED'
);

CREATE TYPE "RegionKind" AS ENUM (
  'COUNTRY_ACCESS',
  'OPERATING_HUB'
);

CREATE TABLE "ServiceRegion" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT,
  "countryCode" TEXT NOT NULL,
  "kind" "RegionKind" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRegion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceLocation" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT,
  "type" "LocationType" NOT NULL,
  "countryCode" TEXT NOT NULL,
  "city" TEXT,
  "governorate" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceRoute" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT,
  "originId" UUID NOT NULL,
  "destinationId" UUID NOT NULL,
  "routeType" "RouteType" NOT NULL,
  "requiresFlightDetails" BOOLEAN NOT NULL DEFAULT false,
  "estimatedMinutes" INTEGER,
  "distanceKm" DECIMAL(10,2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteRequiredRegion" (
  "routeId" UUID NOT NULL,
  "regionId" UUID NOT NULL,
  CONSTRAINT "RouteRequiredRegion_pkey" PRIMARY KEY ("routeId", "regionId")
);

CREATE TABLE "DriverRegionAccess" (
  "id" UUID NOT NULL,
  "driverProfileId" UUID NOT NULL,
  "regionId" UUID NOT NULL,
  "status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverRegionAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleRegionAccess" (
  "id" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "regionId" UUID NOT NULL,
  "status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
  "permitNumber" TEXT,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "documentUrl" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleRegionAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleImage" (
  "id" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isApproved" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleImage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DriverProfile"
  ADD COLUMN "licenseNumber" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "baseRegionId" UUID;

ALTER TABLE "Vehicle"
  ADD COLUMN "primaryImageUrl" TEXT,
  ADD COLUMN "baseRegionId" UUID;

ALTER TABLE "PricingRule"
  ALTER COLUMN "direction" DROP NOT NULL,
  ADD COLUMN "routeId" UUID,
  ADD COLUMN "scopeKey" TEXT;

UPDATE "PricingRule"
SET "scopeKey" = 'DIRECTION:' || "direction"::TEXT;

ALTER TABLE "PricingRule"
  ALTER COLUMN "scopeKey" SET NOT NULL;

ALTER TABLE "Trip"
  ADD COLUMN "routeId" UUID;

ALTER TABLE "ServiceRun"
  ALTER COLUMN "direction" DROP NOT NULL,
  ADD COLUMN "routeId" UUID;

CREATE UNIQUE INDEX "ServiceRegion_code_key" ON "ServiceRegion"("code");
CREATE INDEX "ServiceRegion_kind_countryCode_isActive_idx" ON "ServiceRegion"("kind", "countryCode", "isActive");

CREATE UNIQUE INDEX "ServiceLocation_code_key" ON "ServiceLocation"("code");
CREATE INDEX "ServiceLocation_countryCode_type_isActive_idx" ON "ServiceLocation"("countryCode", "type", "isActive");

CREATE UNIQUE INDEX "ServiceRoute_code_key" ON "ServiceRoute"("code");
CREATE UNIQUE INDEX "ServiceRoute_originId_destinationId_key" ON "ServiceRoute"("originId", "destinationId");
CREATE INDEX "ServiceRoute_isActive_routeType_idx" ON "ServiceRoute"("isActive", "routeType");

CREATE INDEX "RouteRequiredRegion_regionId_idx" ON "RouteRequiredRegion"("regionId");

CREATE UNIQUE INDEX "DriverProfile_licenseNumber_key" ON "DriverProfile"("licenseNumber");
CREATE INDEX "DriverProfile_baseRegionId_idx" ON "DriverProfile"("baseRegionId");

CREATE INDEX "Vehicle_driverProfileId_isActive_idx" ON "Vehicle"("driverProfileId", "isActive");
CREATE INDEX "Vehicle_baseRegionId_idx" ON "Vehicle"("baseRegionId");
CREATE INDEX "VehicleImage_vehicleId_isApproved_sortOrder_idx" ON "VehicleImage"("vehicleId", "isApproved", "sortOrder");

CREATE UNIQUE INDEX "DriverRegionAccess_driverProfileId_regionId_key"
  ON "DriverRegionAccess"("driverProfileId", "regionId");
CREATE INDEX "DriverRegionAccess_regionId_status_idx"
  ON "DriverRegionAccess"("regionId", "status");

CREATE UNIQUE INDEX "VehicleRegionAccess_vehicleId_regionId_key"
  ON "VehicleRegionAccess"("vehicleId", "regionId");
CREATE INDEX "VehicleRegionAccess_regionId_status_idx"
  ON "VehicleRegionAccess"("regionId", "status");

DROP INDEX IF EXISTS "PricingRule_direction_bookingType_key";
CREATE UNIQUE INDEX "PricingRule_scopeKey_bookingType_key"
  ON "PricingRule"("scopeKey", "bookingType");
CREATE INDEX "PricingRule_isActive_routeId_bookingType_idx"
  ON "PricingRule"("isActive", "routeId", "bookingType");

CREATE INDEX "Trip_travelDate_routeId_idx" ON "Trip"("travelDate", "routeId");
CREATE INDEX "ServiceRun_routeId_bookingType_travelDate_idx"
  ON "ServiceRun"("routeId", "bookingType", "travelDate");

ALTER TABLE "DriverProfile"
  ADD CONSTRAINT "DriverProfile_baseRegionId_fkey"
  FOREIGN KEY ("baseRegionId") REFERENCES "ServiceRegion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_baseRegionId_fkey"
  FOREIGN KEY ("baseRegionId") REFERENCES "ServiceRegion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRoute"
  ADD CONSTRAINT "ServiceRoute_originId_fkey"
  FOREIGN KEY ("originId") REFERENCES "ServiceLocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceRoute"
  ADD CONSTRAINT "ServiceRoute_destinationId_fkey"
  FOREIGN KEY ("destinationId") REFERENCES "ServiceLocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RouteRequiredRegion"
  ADD CONSTRAINT "RouteRequiredRegion_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouteRequiredRegion"
  ADD CONSTRAINT "RouteRequiredRegion_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverRegionAccess"
  ADD CONSTRAINT "DriverRegionAccess_driverProfileId_fkey"
  FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverRegionAccess"
  ADD CONSTRAINT "DriverRegionAccess_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleRegionAccess"
  ADD CONSTRAINT "VehicleRegionAccess_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleRegionAccess"
  ADD CONSTRAINT "VehicleRegionAccess_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleImage"
  ADD CONSTRAINT "VehicleImage_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PricingRule"
  ADD CONSTRAINT "PricingRule_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Trip"
  ADD CONSTRAINT "Trip_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRun"
  ADD CONSTRAINT "ServiceRun_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
