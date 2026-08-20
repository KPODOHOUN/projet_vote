-- AlterEnum PaymentPurpose
ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'ORGANIZER_VOTE_TOPUP';

-- CreateEnum TenantOfferType
DO $$ BEGIN
  CREATE TYPE "TenantOfferType" AS ENUM ('EXTERNAL', 'ESCROW');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum AuthOtpPurpose
DO $$ BEGIN
  CREATE TYPE "AuthOtpPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum WalletLedgerKind
DO $$ BEGIN
  CREATE TYPE "WalletLedgerKind" AS ENUM ('VOTE_CREDIT', 'TOPUP_CREDIT', 'RETENTION_DEBIT', 'WITHDRAWAL_DEBIT', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum WithdrawalStatus
DO $$ BEGIN
  CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "offerType" "TenantOfferType" NOT NULL DEFAULT 'ESCROW';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "fedapaySubAccountRef" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "fedapaySubAccountSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "fedapaySubAccountVerifiedAt" TIMESTAMP(3);

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- AlterTable Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- AlterTable PaymentTransaction
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "splitBeneficiaryRef" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "splitAmountCfa" INTEGER;

-- CreateTable AuthOtpChallenge
CREATE TABLE IF NOT EXISTS "AuthOtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AuthOtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuthOtpChallenge_userId_purpose_consumedAt_idx" ON "AuthOtpChallenge"("userId", "purpose", "consumedAt");
CREATE INDEX IF NOT EXISTS "AuthOtpChallenge_expiresAt_idx" ON "AuthOtpChallenge"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "AuthOtpChallenge" ADD CONSTRAINT "AuthOtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable OrganizerWallet
CREATE TABLE IF NOT EXISTS "OrganizerWallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "availableCfa" INTEGER NOT NULL DEFAULT 0,
    "pendingCfa" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizerWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerWallet_tenantId_key" ON "OrganizerWallet"("tenantId");

DO $$ BEGIN
  ALTER TABLE "OrganizerWallet" ADD CONSTRAINT "OrganizerWallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable WalletLedgerEntry
CREATE TABLE IF NOT EXISTS "WalletLedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "kind" "WalletLedgerKind" NOT NULL,
    "amountCfa" INTEGER NOT NULL,
    "eventId" TEXT,
    "paymentId" TEXT,
    "withdrawalId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WalletLedgerEntry_walletId_createdAt_idx" ON "WalletLedgerEntry"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletLedgerEntry_eventId_idx" ON "WalletLedgerEntry"("eventId");

DO $$ BEGIN
  ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "OrganizerWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable WithdrawalRequest
CREATE TABLE IF NOT EXISTS "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountCfa" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "processedByUserId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WithdrawalRequest_tenantId_status_createdAt_idx" ON "WithdrawalRequest"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Seed offer / OTP platform settings (upsert via app seed preferred; defaults documented)
-- Migration mapping: partner tenants → ESCROW already default; BYO left for app migration job.

-- Safe native-split defaults. FeexPay/KkiaPay remain blocked until a verified
-- multi-beneficiary API is integrated; FedaPay Marketplace is the supported path.
INSERT INTO "PlatformSetting" ("id", "key", "value", "createdAt", "updatedAt", "updatedByUserId")
VALUES
  ('setting_split_feexpay_20260729', 'psp_feexpay_supports_split', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system:migration'),
  ('setting_split_fedapay_20260729', 'psp_fedapay_supports_split', 'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system:migration'),
  ('setting_split_kkiapay_20260729', 'psp_kkiapay_supports_split', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system:migration')
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "updatedAt" = CURRENT_TIMESTAMP,
    "updatedByUserId" = 'system:migration';
