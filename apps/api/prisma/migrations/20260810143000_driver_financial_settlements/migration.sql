CREATE TABLE "DriverLedgerEntry" (
  "id" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "tripId" UUID,
  "type" TEXT NOT NULL,
  "balanceDelta" DECIMAL(12,3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "sourceKey" TEXT,
  "note" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverLedgerEntry_type_check" CHECK (
    "type" IN ('TRIP_POSITION', 'SETTLEMENT_TO_DRIVER', 'SETTLEMENT_TO_PLATFORM')
  ),
  CONSTRAINT "DriverLedgerEntry_nonzero_delta_check" CHECK ("balanceDelta" <> 0)
);

CREATE UNIQUE INDEX "DriverLedgerEntry_sourceKey_key"
  ON "DriverLedgerEntry"("sourceKey");
CREATE INDEX "DriverLedgerEntry_driverId_currency_createdAt_idx"
  ON "DriverLedgerEntry"("driverId", "currency", "createdAt" DESC);
CREATE INDEX "DriverLedgerEntry_tripId_createdAt_idx"
  ON "DriverLedgerEntry"("tripId", "createdAt");

ALTER TABLE "DriverLedgerEntry"
  ADD CONSTRAINT "DriverLedgerEntry_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverLedgerEntry"
  ADD CONSTRAINT "DriverLedgerEntry_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DriverLedgerEntry"
  ADD CONSTRAINT "DriverLedgerEntry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DriverSettlement" (
  "id" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" DECIMAL(12,3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "note" TEXT,
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" UUID,
  "ledgerEntryId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverSettlement_direction_check" CHECK (
    "direction" IN ('TO_DRIVER', 'TO_PLATFORM')
  ),
  CONSTRAINT "DriverSettlement_amount_positive_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "DriverSettlement_ledgerEntryId_key"
  ON "DriverSettlement"("ledgerEntryId");
CREATE INDEX "DriverSettlement_driverId_currency_settledAt_idx"
  ON "DriverSettlement"("driverId", "currency", "settledAt" DESC);

ALTER TABLE "DriverSettlement"
  ADD CONSTRAINT "DriverSettlement_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverSettlement"
  ADD CONSTRAINT "DriverSettlement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DriverSettlement"
  ADD CONSTRAINT "DriverSettlement_ledgerEntryId_fkey"
  FOREIGN KEY ("ledgerEntryId") REFERENCES "DriverLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill the current financial position for already-paid completed bookings.
-- Positive balanceDelta: the platform owes the driver.
-- Negative balanceDelta: the driver owes the platform.
INSERT INTO "DriverLedgerEntry" (
  "id",
  "driverId",
  "tripId",
  "type",
  "balanceDelta",
  "currency",
  "sourceKey",
  "note",
  "createdAt"
)
SELECT
  gen_random_uuid(),
  t."driverId",
  t."id",
  'TRIP_POSITION',
  CASE
    WHEN t."paymentReceiver" = 'ADMIN'::"PaymentReceiver" THEN t."driverFee"
    WHEN t."paymentReceiver" = 'DRIVER'::"PaymentReceiver" THEN -t."platformMargin"
    ELSE 0
  END,
  t."currency",
  'trip:' || t."id"::text || ':initial',
  'Initial position backfilled from paid booking',
  COALESCE(t."paymentReceivedAt", t."completedAt", CURRENT_TIMESTAMP)
FROM "Trip" t
WHERE t."driverId" IS NOT NULL
  AND t."status" = 'COMPLETED'::"TripStatus"
  AND t."paymentStatus" = 'PAID'::"PaymentStatus"
  AND t."paymentReceiver" IS NOT NULL
  AND (
    (t."paymentReceiver" = 'ADMIN'::"PaymentReceiver" AND t."driverFee" <> 0)
    OR
    (t."paymentReceiver" = 'DRIVER'::"PaymentReceiver" AND t."platformMargin" <> 0)
  );
