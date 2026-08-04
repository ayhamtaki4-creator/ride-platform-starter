-- ExtendEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'FLIGHT_TICKET';

-- CreateEnum
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Trip"
ADD COLUMN "clientRequestId" UUID,
ADD COLUMN "flightTicketMediaId" UUID,
ADD COLUMN "flightTicketData" JSONB;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN "metadata" JSONB;

-- Existing operational staff with a phone number receive service updates by default.
UPDATE "User" AS u
SET "whatsappOptIn" = true
WHERE u."phone" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "UserRole" ur
    JOIN "Role" r ON r."id" = ur."roleId"
    WHERE ur."userId" = u."id"
      AND r."code" IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'DRIVER')
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

-- CreateIndex
CREATE UNIQUE INDEX "Trip_clientRequestId_key" ON "Trip"("clientRequestId");
CREATE UNIQUE INDEX "Trip_flightTicketMediaId_key" ON "Trip"("flightTicketMediaId");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE INDEX "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");
CREATE UNIQUE INDEX "WhatsAppDelivery_notificationId_key" ON "WhatsAppDelivery"("notificationId");
CREATE INDEX "WhatsAppDelivery_status_nextAttemptAt_idx" ON "WhatsAppDelivery"("status", "nextAttemptAt");
CREATE INDEX "WhatsAppDelivery_userId_createdAt_idx" ON "WhatsAppDelivery"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_flightTicketMediaId_fkey" FOREIGN KEY ("flightTicketMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppDelivery" ADD CONSTRAINT "WhatsAppDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppDelivery" ADD CONSTRAINT "WhatsAppDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
