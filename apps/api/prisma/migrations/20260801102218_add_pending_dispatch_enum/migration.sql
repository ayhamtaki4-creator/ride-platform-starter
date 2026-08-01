-- Add the enum value in a separate committed migration
ALTER TYPE "TripStatus"
ADD VALUE IF NOT EXISTS 'PENDING_DISPATCH';
