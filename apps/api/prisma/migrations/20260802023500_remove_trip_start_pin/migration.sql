-- Disable the legacy trip start PIN.
UPDATE "Trip" SET "startPin" = NULL;
ALTER TABLE "Trip" ALTER COLUMN "startPin" DROP NOT NULL;
