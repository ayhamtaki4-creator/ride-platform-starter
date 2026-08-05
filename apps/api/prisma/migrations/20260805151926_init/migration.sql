-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DriverAvailability" AS ENUM ('OFFLINE', 'ONLINE', 'ON_TRIP');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PENDING_DISPATCH', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'NO_DRIVER_AVAILABLE', 'PASSENGER_NO_SHOW', 'DRIVER_NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingDirection" AS ENUM ('BEIRUT_AIRPORT_TO_DAMASCUS', 'DAMASCUS_TO_BEIRUT_AIRPORT');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('SHARED_SEAT', 'PRIVATE_CAR');

-- CreateEnum
CREATE TYPE "VehicleClass" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "BookingReviewStatus" AS ENUM ('NEW', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DriverAssignmentStatus" AS ENUM ('UNASSIGNED', 'PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ServiceRunStatus" AS ENUM ('DRAFT', 'PLANNED', 'SCHEDULED', 'DRIVER_PENDING', 'DRIVER_ACCEPTED', 'BOARDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DRIVER_REPLACEMENT_REQUIRED');

-- CreateEnum
CREATE TYPE "ServiceRunPassengerStatus" AS ENUM ('WAITING', 'PICKED_UP', 'NO_SHOW', 'DROPPED_OFF');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('CITY', 'AIRPORT', 'GOVERNORATE', 'BORDER', 'STATION');

-- CreateEnum
CREATE TYPE "RouteType" AS ENUM ('INTERCITY', 'INTERNATIONAL', 'AIRPORT_TRANSFER', 'PRIVATE_TRANSFER');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'APPROVED', 'EXPIRED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RegionKind" AS ENUM ('COUNTRY_ACCESS', 'OPERATING_HUB');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ComplianceSubject" AS ENUM ('DRIVER', 'VEHICLE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('DRIVER_AVATAR', 'VEHICLE_IMAGE', 'DRIVER_DOCUMENT', 'VEHICLE_DOCUMENT', 'FLIGHT_TICKET', 'OTHER');

-- CreateEnum
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TelegramDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "PassengerProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassengerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "availability" "DriverAvailability" NOT NULL DEFAULT 'OFFLINE',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "licenseNumber" TEXT,
    "avatarUrl" TEXT,
    "avatarMediaId" UUID,
    "baseRegionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "driverProfileId" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "seatCapacity" INTEGER NOT NULL DEFAULT 4,
    "primaryImageUrl" TEXT,
    "primaryImageMediaId" UUID,
    "baseRegionId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleImage" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "mediaAssetId" UUID,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" UUID NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "direction" "BookingDirection",
    "routeId" UUID,
    "bookingType" "BookingType" NOT NULL,
    "vehicleClass" "VehicleClass" NOT NULL DEFAULT 'SMALL',
    "passengerPrice" DECIMAL(12,2) NOT NULL,
    "driverFee" DECIMAL(12,2) NOT NULL,
    "platformMargin" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleClassConfig" (
    "vehicleClass" "VehicleClass" NOT NULL,
    "passengerCapacity" INTEGER NOT NULL,
    "luggageCapacity" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleClassConfig_pkey" PRIMARY KEY ("vehicleClass")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "clientRequestId" UUID,
    "passengerId" UUID NOT NULL,
    "driverId" UUID,
    "pricingRuleId" UUID,
    "routeId" UUID,
    "serviceRunId" UUID,
    "serviceRunPassengerStatus" "ServiceRunPassengerStatus" NOT NULL DEFAULT 'WAITING',
    "pickupOrder" INTEGER,
    "pickedUpAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "droppedOffAt" TIMESTAMP(3),
    "status" "TripStatus" NOT NULL DEFAULT 'PENDING_DISPATCH',
    "bookingReviewStatus" "BookingReviewStatus" NOT NULL DEFAULT 'CONFIRMED',
    "driverAssignmentStatus" "DriverAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "bookingReference" TEXT,
    "direction" "BookingDirection",
    "bookingType" "BookingType",
    "vehicleClass" "VehicleClass" NOT NULL DEFAULT 'SMALL',
    "travelDate" TIMESTAMP(3),
    "flightArrivalTime" TEXT,
    "flightNumber" TEXT,
    "flightTicketMediaId" UUID,
    "flightTicketData" JSONB,
    "passengerCount" INTEGER NOT NULL DEFAULT 1,
    "luggageCount" INTEGER NOT NULL DEFAULT 0,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "pickupLatitude" DOUBLE PRECISION NOT NULL,
    "pickupLongitude" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLatitude" DOUBLE PRECISION NOT NULL,
    "dropoffLongitude" DOUBLE PRECISION NOT NULL,
    "estimatedDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 0,
    "estimatedFare" DECIMAL(12,3) NOT NULL,
    "driverFee" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "platformMargin" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "finalFare" DECIMAL(12,3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startPin" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "driverRespondedAt" TIMESTAMP(3),
    "driverRejectionReason" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRun" (
    "id" UUID NOT NULL,
    "runReference" TEXT NOT NULL,
    "direction" "BookingDirection",
    "routeId" UUID,
    "bookingType" "BookingType" NOT NULL,
    "travelDate" TIMESTAMP(3) NOT NULL,
    "driverId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "status" "ServiceRunStatus" NOT NULL DEFAULT 'PLANNED',
    "seatCapacity" INTEGER NOT NULL,
    "reservedSeats" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "driverAcceptedAt" TIMESTAMP(3),
    "boardingStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "driverRejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "ServiceRoute" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "originId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "routeType" "RouteType" NOT NULL,
    "requiresFlightDetails" BOOLEAN NOT NULL DEFAULT false,
    "flightTicketUploadEnabled" BOOLEAN NOT NULL DEFAULT true,
    "estimatedMinutes" INTEGER,
    "distanceKm" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteRequiredRegion" (
    "routeId" UUID NOT NULL,
    "regionId" UUID NOT NULL,

    CONSTRAINT "RouteRequiredRegion_pkey" PRIMARY KEY ("routeId","regionId")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "uploadedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" UUID NOT NULL,
    "driverProfileId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "regionId" UUID,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDocument" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "regionId" UUID,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionDocumentRequirement" (
    "id" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "subject" "ComplianceSubject" NOT NULL,
    "documentType" TEXT NOT NULL,
    "minValidityDays" INTEGER NOT NULL DEFAULT 0,
    "regionScoped" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStatusHistory" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "from" "TripStatus",
    "to" "TripStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "link" TEXT,
    "dedupeKey" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'ar',
    "parameters" JSONB NOT NULL,
    "status" "WhatsAppDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramDelivery" (
    "id" UUID NOT NULL,
    "tripId" UUID,
    "dedupeKey" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "buttonText" TEXT,
    "buttonUrl" TEXT,
    "status" "TelegramDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerProfile_userId_key" ON "PassengerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_licenseNumber_key" ON "DriverProfile"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_avatarMediaId_key" ON "DriverProfile"("avatarMediaId");

-- CreateIndex
CREATE INDEX "DriverProfile_status_availability_idx" ON "DriverProfile"("status", "availability");

-- CreateIndex
CREATE INDEX "DriverProfile_baseRegionId_idx" ON "DriverProfile"("baseRegionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateNumber_key" ON "Vehicle"("plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_primaryImageMediaId_key" ON "Vehicle"("primaryImageMediaId");

-- CreateIndex
CREATE INDEX "Vehicle_driverProfileId_isActive_idx" ON "Vehicle"("driverProfileId", "isActive");

-- CreateIndex
CREATE INDEX "Vehicle_baseRegionId_idx" ON "Vehicle"("baseRegionId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleImage_mediaAssetId_key" ON "VehicleImage"("mediaAssetId");

-- CreateIndex
CREATE INDEX "VehicleImage_vehicleId_isApproved_sortOrder_idx" ON "VehicleImage"("vehicleId", "isApproved", "sortOrder");

-- CreateIndex
CREATE INDEX "PricingRule_isActive_direction_bookingType_idx" ON "PricingRule"("isActive", "direction", "bookingType");

-- CreateIndex
CREATE INDEX "PricingRule_isActive_routeId_bookingType_vehicleClass_idx" ON "PricingRule"("isActive", "routeId", "bookingType", "vehicleClass");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_scopeKey_bookingType_vehicleClass_key" ON "PricingRule"("scopeKey", "bookingType", "vehicleClass");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_clientRequestId_key" ON "Trip"("clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_bookingReference_key" ON "Trip"("bookingReference");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_flightTicketMediaId_key" ON "Trip"("flightTicketMediaId");

-- CreateIndex
CREATE INDEX "Trip_passengerId_requestedAt_idx" ON "Trip"("passengerId", "requestedAt");

-- CreateIndex
CREATE INDEX "Trip_driverId_requestedAt_idx" ON "Trip"("driverId", "requestedAt");

-- CreateIndex
CREATE INDEX "Trip_status_requestedAt_idx" ON "Trip"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "Trip_bookingReviewStatus_requestedAt_idx" ON "Trip"("bookingReviewStatus", "requestedAt");

-- CreateIndex
CREATE INDEX "Trip_travelDate_direction_idx" ON "Trip"("travelDate", "direction");

-- CreateIndex
CREATE INDEX "Trip_travelDate_routeId_idx" ON "Trip"("travelDate", "routeId");

-- CreateIndex
CREATE INDEX "Trip_serviceRunId_driverAssignmentStatus_idx" ON "Trip"("serviceRunId", "driverAssignmentStatus");

-- CreateIndex
CREATE INDEX "Trip_serviceRunId_serviceRunPassengerStatus_idx" ON "Trip"("serviceRunId", "serviceRunPassengerStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRun_runReference_key" ON "ServiceRun"("runReference");

-- CreateIndex
CREATE INDEX "ServiceRun_driverId_travelDate_idx" ON "ServiceRun"("driverId", "travelDate");

-- CreateIndex
CREATE INDEX "ServiceRun_direction_bookingType_travelDate_idx" ON "ServiceRun"("direction", "bookingType", "travelDate");

-- CreateIndex
CREATE INDEX "ServiceRun_routeId_bookingType_travelDate_idx" ON "ServiceRun"("routeId", "bookingType", "travelDate");

-- CreateIndex
CREATE INDEX "ServiceRun_status_travelDate_idx" ON "ServiceRun"("status", "travelDate");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRegion_code_key" ON "ServiceRegion"("code");

-- CreateIndex
CREATE INDEX "ServiceRegion_kind_countryCode_isActive_idx" ON "ServiceRegion"("kind", "countryCode", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLocation_code_key" ON "ServiceLocation"("code");

-- CreateIndex
CREATE INDEX "ServiceLocation_countryCode_type_isActive_idx" ON "ServiceLocation"("countryCode", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRoute_code_key" ON "ServiceRoute"("code");

-- CreateIndex
CREATE INDEX "ServiceRoute_isActive_routeType_idx" ON "ServiceRoute"("isActive", "routeType");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRoute_originId_destinationId_key" ON "ServiceRoute"("originId", "destinationId");

-- CreateIndex
CREATE INDEX "RouteRequiredRegion_regionId_idx" ON "RouteRequiredRegion"("regionId");

-- CreateIndex
CREATE INDEX "DriverRegionAccess_regionId_status_idx" ON "DriverRegionAccess"("regionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DriverRegionAccess_driverProfileId_regionId_key" ON "DriverRegionAccess"("driverProfileId", "regionId");

-- CreateIndex
CREATE INDEX "VehicleRegionAccess_regionId_status_idx" ON "VehicleRegionAccess"("regionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleRegionAccess_vehicleId_regionId_key" ON "VehicleRegionAccess"("vehicleId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storedName_key" ON "MediaAsset"("storedName");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storagePath_key" ON "MediaAsset"("storagePath");

-- CreateIndex
CREATE INDEX "MediaAsset_purpose_status_createdAt_idx" ON "MediaAsset"("purpose", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_uploadedById_createdAt_idx" ON "MediaAsset"("uploadedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverDocument_mediaAssetId_key" ON "DriverDocument"("mediaAssetId");

-- CreateIndex
CREATE INDEX "DriverDocument_driverProfileId_documentType_status_idx" ON "DriverDocument"("driverProfileId", "documentType", "status");

-- CreateIndex
CREATE INDEX "DriverDocument_regionId_documentType_status_idx" ON "DriverDocument"("regionId", "documentType", "status");

-- CreateIndex
CREATE INDEX "DriverDocument_expiresAt_status_idx" ON "DriverDocument"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDocument_mediaAssetId_key" ON "VehicleDocument"("mediaAssetId");

-- CreateIndex
CREATE INDEX "VehicleDocument_vehicleId_documentType_status_idx" ON "VehicleDocument"("vehicleId", "documentType", "status");

-- CreateIndex
CREATE INDEX "VehicleDocument_regionId_documentType_status_idx" ON "VehicleDocument"("regionId", "documentType", "status");

-- CreateIndex
CREATE INDEX "VehicleDocument_expiresAt_status_idx" ON "VehicleDocument"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "RegionDocumentRequirement_subject_isActive_idx" ON "RegionDocumentRequirement"("subject", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RegionDocumentRequirement_regionId_subject_documentType_key" ON "RegionDocumentRequirement"("regionId", "subject", "documentType");

-- CreateIndex
CREATE INDEX "TripStatusHistory_tripId_createdAt_idx" ON "TripStatusHistory"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppDelivery_notificationId_key" ON "WhatsAppDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_status_nextAttemptAt_idx" ON "WhatsAppDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WhatsAppDelivery_userId_createdAt_idx" ON "WhatsAppDelivery"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramDelivery_tripId_key" ON "TelegramDelivery"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramDelivery_dedupeKey_key" ON "TelegramDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "TelegramDelivery_status_nextAttemptAt_idx" ON "TelegramDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "TelegramDelivery_createdAt_idx" ON "TelegramDelivery"("createdAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerProfile" ADD CONSTRAINT "PassengerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_baseRegionId_fkey" FOREIGN KEY ("baseRegionId") REFERENCES "ServiceRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_baseRegionId_fkey" FOREIGN KEY ("baseRegionId") REFERENCES "ServiceRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_primaryImageMediaId_fkey" FOREIGN KEY ("primaryImageMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleImage" ADD CONSTRAINT "VehicleImage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleImage" ADD CONSTRAINT "VehicleImage_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_serviceRunId_fkey" FOREIGN KEY ("serviceRunId") REFERENCES "ServiceRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_flightTicketMediaId_fkey" FOREIGN KEY ("flightTicketMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRun" ADD CONSTRAINT "ServiceRun_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRun" ADD CONSTRAINT "ServiceRun_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRun" ADD CONSTRAINT "ServiceRun_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRoute" ADD CONSTRAINT "ServiceRoute_originId_fkey" FOREIGN KEY ("originId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRoute" ADD CONSTRAINT "ServiceRoute_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "ServiceLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteRequiredRegion" ADD CONSTRAINT "RouteRequiredRegion_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ServiceRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteRequiredRegion" ADD CONSTRAINT "RouteRequiredRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRegionAccess" ADD CONSTRAINT "DriverRegionAccess_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverRegionAccess" ADD CONSTRAINT "DriverRegionAccess_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleRegionAccess" ADD CONSTRAINT "VehicleRegionAccess_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleRegionAccess" ADD CONSTRAINT "VehicleRegionAccess_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionDocumentRequirement" ADD CONSTRAINT "RegionDocumentRequirement_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStatusHistory" ADD CONSTRAINT "TripStatusHistory_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppDelivery" ADD CONSTRAINT "WhatsAppDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppDelivery" ADD CONSTRAINT "WhatsAppDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
