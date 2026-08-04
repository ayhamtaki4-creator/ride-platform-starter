CREATE TYPE "TelegramDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

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

CREATE UNIQUE INDEX "TelegramDelivery_tripId_key" ON "TelegramDelivery"("tripId");
CREATE UNIQUE INDEX "TelegramDelivery_dedupeKey_key" ON "TelegramDelivery"("dedupeKey");
CREATE INDEX "TelegramDelivery_status_nextAttemptAt_idx" ON "TelegramDelivery"("status", "nextAttemptAt");
CREATE INDEX "TelegramDelivery_createdAt_idx" ON "TelegramDelivery"("createdAt");

ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
