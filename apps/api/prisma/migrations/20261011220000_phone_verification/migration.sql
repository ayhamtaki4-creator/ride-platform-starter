ALTER TABLE "User" ADD COLUMN "provisionalAccount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PhoneVerificationChallenge" (
  "id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneVerificationChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PhoneVerificationChallenge_phone_createdAt_idx" ON "PhoneVerificationChallenge"("phone", "createdAt");
