CREATE TABLE "WebPushSubscription" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "lastSuccessAt" TIMESTAMP(3),
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key"
  ON "WebPushSubscription"("endpoint");

CREATE INDEX "WebPushSubscription_userId_createdAt_idx"
  ON "WebPushSubscription"("userId", "createdAt");
