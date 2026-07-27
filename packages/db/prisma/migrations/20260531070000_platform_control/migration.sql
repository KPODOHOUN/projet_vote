-- Platform-admin control space: commissions, vote cancellation, global settings.

-- Add VOIDED to PaymentStatus (used when an admin cancels a paid vote).
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

-- PaymentTransaction: platform commission captured at confirmation.
ALTER TABLE "PaymentTransaction" ADD COLUMN "commissionCfa" INTEGER;

-- Event: per-event commission override (basis points). Null = platform default.
ALTER TABLE "Event" ADD COLUMN "commissionBps" INTEGER;

-- Vote: platform-admin soft cancellation (kept for audit, excluded from tallies).
ALTER TABLE "Vote" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledReason" TEXT,
ADD COLUMN "cancelledByUserId" TEXT;
CREATE INDEX "Vote_eventId_cancelledAt_idx" ON "Vote"("eventId", "cancelledAt");

-- PlatformSetting: global key/value config (god-mode), e.g. commission_bps.
CREATE TABLE "PlatformSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");
