CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH');
CREATE TYPE "PaymentReceiver" AS ENUM ('ADMIN', 'DRIVER');

ALTER TABLE "Trip"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "paymentReceiver" "PaymentReceiver",
  ADD COLUMN "amountPaid" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "paymentReceivedAt" TIMESTAMP(3),
  ADD COLUMN "paymentNote" TEXT;

CREATE INDEX "Trip_paymentStatus_completedAt_idx"
  ON "Trip"("paymentStatus", "completedAt");
