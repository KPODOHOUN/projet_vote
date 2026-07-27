-- Payouts: automated, anti-double-spend disbursements through the multi-PSP seam.
-- A PayoutPeriod groups all payouts of a billing window; inside a period there is
-- at most ONE Payout per (kind, beneficiaryTenantId). Each PayoutLine pins a
-- source revenue row (PaymentTransaction / VaultEntry) so a revenue is paid out
-- at most once, ever. Payout.provider is the typed PaymentProvider enum (multi-PSP).

CREATE TYPE "PayoutPeriodStatus" AS ENUM ('OPEN', 'PROCESSING', 'CLOSED');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'SUCCEEDED', 'FAILED', 'UNCERTAIN');
CREATE TYPE "PayoutKind" AS ENUM ('ORGANIZER', 'PLATFORM');

-- Organizer payout destination (encrypted Mobile Money number + display last4).
ALTER TABLE "Tenant" ADD COLUMN "payoutNetwork" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "payoutPhoneEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "payoutPhoneLast4" TEXT;

CREATE TABLE "PayoutPeriod" (
  "id"        TEXT PRIMARY KEY,
  "label"     TEXT NOT NULL UNIQUE,
  "from"      TIMESTAMP(3) NOT NULL,
  "to"        TIMESTAMP(3) NOT NULL,
  "status"    "PayoutPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Payout" (
  "id"                  TEXT PRIMARY KEY,
  "periodId"            TEXT NOT NULL REFERENCES "PayoutPeriod"("id") ON DELETE RESTRICT,
  "kind"                "PayoutKind" NOT NULL,
  "beneficiaryTenantId" TEXT,
  "amountCfa"           INTEGER NOT NULL,
  "currency"            TEXT NOT NULL DEFAULT 'XOF',
  "status"              "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey"      TEXT NOT NULL UNIQUE,
  "provider"            "PaymentProvider" NOT NULL,
  "providerRef"         TEXT UNIQUE,
  "errorMessage"        TEXT,
  "lockedAt"            TIMESTAMP(3),
  "completedAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payout_period_kind_beneficiary_key" UNIQUE ("periodId", "kind", "beneficiaryTenantId")
);
CREATE INDEX "Payout_status_idx" ON "Payout" ("status");
CREATE INDEX "Payout_periodId_kind_idx" ON "Payout" ("periodId", "kind");

CREATE TABLE "PayoutLine" (
  "id"                   TEXT PRIMARY KEY,
  "payoutId"             TEXT NOT NULL REFERENCES "Payout"("id") ON DELETE CASCADE,
  "paymentTransactionId" TEXT UNIQUE,
  "vaultEntryId"         TEXT UNIQUE,
  "activationRecoveryId" TEXT UNIQUE,
  "amountCfa"            INTEGER NOT NULL,
  "kind"                 TEXT NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PayoutLine_payoutId_idx" ON "PayoutLine" ("payoutId");

CREATE TABLE "PayoutJobLock" (
  "name"       TEXT PRIMARY KEY,
  "acquiredAt" TIMESTAMP(3) NOT NULL,
  "acquiredBy" TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL
);
