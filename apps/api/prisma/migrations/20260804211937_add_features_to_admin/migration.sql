/*
  Warnings:

  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuthSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DriverDocument` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DriverProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DriverRegionAccess` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MediaAsset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PassengerProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Permission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PricingRule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RegionDocumentRequirement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RolePermission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RouteRequiredRegion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceLocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceRegion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceRoute` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TelegramDelivery` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Trip` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TripStatusHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRole` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Vehicle` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VehicleClassConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VehicleDocument` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VehicleImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VehicleRegionAccess` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WhatsAppDelivery` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "AuthSession" DROP CONSTRAINT "AuthSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "DriverDocument" DROP CONSTRAINT "DriverDocument_driverProfileId_fkey";

-- DropForeignKey
ALTER TABLE "DriverDocument" DROP CONSTRAINT "DriverDocument_mediaAssetId_fkey";

-- DropForeignKey
ALTER TABLE "DriverDocument" DROP CONSTRAINT "DriverDocument_regionId_fkey";

-- DropForeignKey
ALTER TABLE "DriverDocument" DROP CONSTRAINT "DriverDocument_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "DriverProfile" DROP CONSTRAINT "DriverProfile_avatarMediaId_fkey";

-- DropForeignKey
ALTER TABLE "DriverProfile" DROP CONSTRAINT "DriverProfile_baseRegionId_fkey";

-- DropForeignKey
ALTER TABLE "DriverProfile" DROP CONSTRAINT "DriverProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "DriverRegionAccess" DROP CONSTRAINT "DriverRegionAccess_driverProfileId_fkey";

-- DropForeignKey
ALTER TABLE "DriverRegionAccess" DROP CONSTRAINT "DriverRegionAccess_regionId_fkey";

-- DropForeignKey
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "PassengerProfile" DROP CONSTRAINT "PassengerProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "PricingRule" DROP CONSTRAINT "PricingRule_routeId_fkey";

-- DropForeignKey
ALTER TABLE "RegionDocumentRequirement" DROP CONSTRAINT "RegionDocumentRequirement_regionId_fkey";

-- DropForeignKey
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_permissionId_fkey";

-- DropForeignKey
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_roleId_fkey";

-- DropForeignKey
ALTER TABLE "RouteRequiredRegion" DROP CONSTRAINT "RouteRequiredRegion_regionId_fkey";

-- DropForeignKey
ALTER TABLE "RouteRequiredRegion" DROP CONSTRAINT "RouteRequiredRegion_routeId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRoute" DROP CONSTRAINT "ServiceRoute_destinationId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRoute" DROP CONSTRAINT "ServiceRoute_originId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRun" DROP CONSTRAINT "ServiceRun_driverId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRun" DROP CONSTRAINT "ServiceRun_routeId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceRun" DROP CONSTRAINT "ServiceRun_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "TelegramDelivery" DROP CONSTRAINT "TelegramDelivery_tripId_fkey";

-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_driverId_fkey";

-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_flightTicketMediaId_fkey";

-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_passengerId_fkey";

-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_pricingRuleId_fkey";

-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_routeId_fkey";

-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_serviceRunId_fkey";

-- DropForeignKey
ALTER TABLE "TripStatusHistory" DROP CONSTRAINT "TripStatusHistory_tripId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_baseRegionId_fkey";

-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_driverProfileId_fkey";

-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_primaryImageMediaId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleDocument" DROP CONSTRAINT "VehicleDocument_mediaAssetId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleDocument" DROP CONSTRAINT "VehicleDocument_regionId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleDocument" DROP CONSTRAINT "VehicleDocument_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "VehicleDocument" DROP CONSTRAINT "VehicleDocument_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleImage" DROP CONSTRAINT "VehicleImage_mediaAssetId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleImage" DROP CONSTRAINT "VehicleImage_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleRegionAccess" DROP CONSTRAINT "VehicleRegionAccess_regionId_fkey";

-- DropForeignKey
ALTER TABLE "VehicleRegionAccess" DROP CONSTRAINT "VehicleRegionAccess_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "WhatsAppDelivery" DROP CONSTRAINT "WhatsAppDelivery_notificationId_fkey";

-- DropForeignKey
ALTER TABLE "WhatsAppDelivery" DROP CONSTRAINT "WhatsAppDelivery_userId_fkey";

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "AuthSession";

-- DropTable
DROP TABLE "DriverDocument";

-- DropTable
DROP TABLE "DriverProfile";

-- DropTable
DROP TABLE "DriverRegionAccess";

-- DropTable
DROP TABLE "MediaAsset";

-- DropTable
DROP TABLE "Notification";

-- DropTable
DROP TABLE "PassengerProfile";

-- DropTable
DROP TABLE "Permission";

-- DropTable
DROP TABLE "PricingRule";

-- DropTable
DROP TABLE "RegionDocumentRequirement";

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "RolePermission";

-- DropTable
DROP TABLE "RouteRequiredRegion";

-- DropTable
DROP TABLE "ServiceLocation";

-- DropTable
DROP TABLE "ServiceRegion";

-- DropTable
DROP TABLE "ServiceRoute";

-- DropTable
DROP TABLE "ServiceRun";

-- DropTable
DROP TABLE "TelegramDelivery";

-- DropTable
DROP TABLE "Trip";

-- DropTable
DROP TABLE "TripStatusHistory";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "UserRole";

-- DropTable
DROP TABLE "Vehicle";

-- DropTable
DROP TABLE "VehicleClassConfig";

-- DropTable
DROP TABLE "VehicleDocument";

-- DropTable
DROP TABLE "VehicleImage";

-- DropTable
DROP TABLE "VehicleRegionAccess";

-- DropTable
DROP TABLE "WhatsAppDelivery";

-- DropEnum
DROP TYPE "AccessStatus";

-- DropEnum
DROP TYPE "BookingDirection";

-- DropEnum
DROP TYPE "BookingReviewStatus";

-- DropEnum
DROP TYPE "BookingType";

-- DropEnum
DROP TYPE "ComplianceSubject";

-- DropEnum
DROP TYPE "DocumentStatus";

-- DropEnum
DROP TYPE "DriverAssignmentStatus";

-- DropEnum
DROP TYPE "DriverAvailability";

-- DropEnum
DROP TYPE "DriverStatus";

-- DropEnum
DROP TYPE "LocationType";

-- DropEnum
DROP TYPE "MediaPurpose";

-- DropEnum
DROP TYPE "MediaStatus";

-- DropEnum
DROP TYPE "MediaVisibility";

-- DropEnum
DROP TYPE "RegionKind";

-- DropEnum
DROP TYPE "RouteType";

-- DropEnum
DROP TYPE "ServiceRunPassengerStatus";

-- DropEnum
DROP TYPE "ServiceRunStatus";

-- DropEnum
DROP TYPE "TelegramDeliveryStatus";

-- DropEnum
DROP TYPE "TripStatus";

-- DropEnum
DROP TYPE "UserStatus";

-- DropEnum
DROP TYPE "VehicleClass";

-- DropEnum
DROP TYPE "WhatsAppDeliveryStatus";
