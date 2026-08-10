CREATE TABLE "MobilePushDevice" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobilePushDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushDevice_token_key" ON "MobilePushDevice"("token");
CREATE INDEX "MobilePushDevice_userId_updatedAt_idx" ON "MobilePushDevice"("userId", "updatedAt");
CREATE INDEX "MobilePushDevice_userId_failureCount_idx" ON "MobilePushDevice"("userId", "failureCount");
CREATE UNIQUE INDEX "MobilePushDelivery_notificationId_deviceId_key" ON "MobilePushDelivery"("notificationId", "deviceId");
CREATE INDEX "MobilePushDelivery_status_updatedAt_idx" ON "MobilePushDelivery"("status", "updatedAt");

ALTER TABLE "MobilePushDevice"
ADD CONSTRAINT "MobilePushDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePushDelivery"
ADD CONSTRAINT "MobilePushDelivery_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobilePushDelivery"
ADD CONSTRAINT "MobilePushDelivery_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "MobilePushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
