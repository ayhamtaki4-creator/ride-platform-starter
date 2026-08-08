CREATE TABLE "MediaBrandingSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "logoMediaAssetId" UUID,
  "watermarkEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "plateBlurEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "watermarkOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.72,
  "watermarkWidthPercent" DOUBLE PRECISION NOT NULL DEFAULT 18,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaBrandingSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaBrandingSetting_logoMediaAssetId_fkey" FOREIGN KEY ("logoMediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MediaBrandingSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MediaBrandingSetting_watermarkOpacity_check" CHECK ("watermarkOpacity" >= 0.1 AND "watermarkOpacity" <= 1),
  CONSTRAINT "MediaBrandingSetting_watermarkWidthPercent_check" CHECK ("watermarkWidthPercent" >= 5 AND "watermarkWidthPercent" <= 40)
);

INSERT INTO "MediaBrandingSetting" ("id") VALUES ('default')
ON CONFLICT ("id") DO NOTHING;
