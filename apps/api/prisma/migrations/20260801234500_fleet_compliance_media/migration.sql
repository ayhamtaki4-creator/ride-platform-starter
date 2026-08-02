CREATE TYPE "DocumentStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED'
);

CREATE TYPE "ComplianceSubject" AS ENUM (
  'DRIVER',
  'VEHICLE'
);

CREATE TYPE "MediaStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DELETED'
);

CREATE TYPE "MediaVisibility" AS ENUM (
  'PUBLIC',
  'PRIVATE'
);

CREATE TYPE "MediaPurpose" AS ENUM (
  'DRIVER_AVATAR',
  'VEHICLE_IMAGE',
  'DRIVER_DOCUMENT',
  'VEHICLE_DOCUMENT',
  'OTHER'
);

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

ALTER TABLE "DriverProfile"
  ADD COLUMN "avatarMediaId" UUID;

ALTER TABLE "Vehicle"
  ADD COLUMN "primaryImageMediaId" UUID;

ALTER TABLE "VehicleImage"
  ADD COLUMN "mediaAssetId" UUID;

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

CREATE UNIQUE INDEX "MediaAsset_storedName_key" ON "MediaAsset"("storedName");
CREATE UNIQUE INDEX "MediaAsset_storagePath_key" ON "MediaAsset"("storagePath");
CREATE INDEX "MediaAsset_purpose_status_createdAt_idx" ON "MediaAsset"("purpose", "status", "createdAt");
CREATE INDEX "MediaAsset_uploadedById_createdAt_idx" ON "MediaAsset"("uploadedById", "createdAt");

CREATE UNIQUE INDEX "DriverProfile_avatarMediaId_key" ON "DriverProfile"("avatarMediaId");
CREATE UNIQUE INDEX "Vehicle_primaryImageMediaId_key" ON "Vehicle"("primaryImageMediaId");
CREATE UNIQUE INDEX "VehicleImage_mediaAssetId_key" ON "VehicleImage"("mediaAssetId");

CREATE UNIQUE INDEX "DriverDocument_mediaAssetId_key" ON "DriverDocument"("mediaAssetId");
CREATE INDEX "DriverDocument_driverProfileId_documentType_status_idx"
  ON "DriverDocument"("driverProfileId", "documentType", "status");
CREATE INDEX "DriverDocument_regionId_documentType_status_idx"
  ON "DriverDocument"("regionId", "documentType", "status");
CREATE INDEX "DriverDocument_expiresAt_status_idx"
  ON "DriverDocument"("expiresAt", "status");

CREATE UNIQUE INDEX "VehicleDocument_mediaAssetId_key" ON "VehicleDocument"("mediaAssetId");
CREATE INDEX "VehicleDocument_vehicleId_documentType_status_idx"
  ON "VehicleDocument"("vehicleId", "documentType", "status");
CREATE INDEX "VehicleDocument_regionId_documentType_status_idx"
  ON "VehicleDocument"("regionId", "documentType", "status");
CREATE INDEX "VehicleDocument_expiresAt_status_idx"
  ON "VehicleDocument"("expiresAt", "status");

CREATE UNIQUE INDEX "RegionDocumentRequirement_regionId_subject_documentType_key"
  ON "RegionDocumentRequirement"("regionId", "subject", "documentType");
CREATE INDEX "RegionDocumentRequirement_subject_isActive_idx"
  ON "RegionDocumentRequirement"("subject", "isActive");

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DriverProfile"
  ADD CONSTRAINT "DriverProfile_avatarMediaId_fkey"
  FOREIGN KEY ("avatarMediaId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_primaryImageMediaId_fkey"
  FOREIGN KEY ("primaryImageMediaId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VehicleImage"
  ADD CONSTRAINT "VehicleImage_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DriverDocument"
  ADD CONSTRAINT "DriverDocument_driverProfileId_fkey"
  FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverDocument"
  ADD CONSTRAINT "DriverDocument_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DriverDocument"
  ADD CONSTRAINT "DriverDocument_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DriverDocument"
  ADD CONSTRAINT "DriverDocument_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VehicleDocument"
  ADD CONSTRAINT "VehicleDocument_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleDocument"
  ADD CONSTRAINT "VehicleDocument_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VehicleDocument"
  ADD CONSTRAINT "VehicleDocument_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VehicleDocument"
  ADD CONSTRAINT "VehicleDocument_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RegionDocumentRequirement"
  ADD CONSTRAINT "RegionDocumentRequirement_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "ServiceRegion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
