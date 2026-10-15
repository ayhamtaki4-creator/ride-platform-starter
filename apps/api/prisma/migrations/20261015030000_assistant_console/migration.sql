-- Additive only: does not modify or delete existing bookings, users, or trips.
CREATE TABLE IF NOT EXISTS "AssistantConfiguration" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "welcomeMessage" TEXT NOT NULL,
  "faqs" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssistantConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantMetric" (
  "day" DATE NOT NULL,
  "event" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssistantMetric_pkey" PRIMARY KEY ("day","event","topic")
);
CREATE INDEX IF NOT EXISTS "AssistantMetric_day_idx" ON "AssistantMetric"("day");
