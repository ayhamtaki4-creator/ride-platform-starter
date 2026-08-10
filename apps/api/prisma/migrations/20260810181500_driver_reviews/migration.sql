CREATE TABLE "DriverReview" (
  "id" UUID NOT NULL,
  "tripId" UUID NOT NULL,
  "passengerId" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "DriverReview_comment_length_check" CHECK ("comment" IS NULL OR char_length("comment") <= 500)
);

CREATE UNIQUE INDEX "DriverReview_tripId_key" ON "DriverReview"("tripId");
CREATE INDEX "DriverReview_driverId_createdAt_idx" ON "DriverReview"("driverId", "createdAt" DESC);
CREATE INDEX "DriverReview_passengerId_createdAt_idx" ON "DriverReview"("passengerId", "createdAt" DESC);

ALTER TABLE "DriverReview"
  ADD CONSTRAINT "DriverReview_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverReview"
  ADD CONSTRAINT "DriverReview_passengerId_fkey"
  FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverReview"
  ADD CONSTRAINT "DriverReview_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
