CREATE TYPE "PartnerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ActivationDebtStatus" AS ENUM ('OUTSTANDING', 'SETTLED', 'WRITTEN_OFF');

ALTER TABLE "Tenant" ADD COLUMN "isPartner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "partnerCommissionBps" INTEGER;

CREATE TABLE "PlatformSecret" (
  "id"              TEXT NOT NULL,
  "key"             TEXT NOT NULL,
  "cipherText"      TEXT NOT NULL,
  "iv"              TEXT NOT NULL,
  "authTag"         TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSecret_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformSecret_key_key" ON "PlatformSecret"("key");

CREATE TABLE "PartnerRequest" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "eventId"           TEXT NOT NULL,
  "status"            "PartnerRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "decidedByUserId"   TEXT,
  "decidedAt"         TIMESTAMP(3),
  "reason"            TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerRequest_eventId_key" ON "PartnerRequest"("eventId");
CREATE INDEX "PartnerRequest_tenantId_status_idx" ON "PartnerRequest"("tenantId", "status");
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActivationDebt" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "eventId"      TEXT NOT NULL,
  "amountCfa"    INTEGER NOT NULL,
  "recoveredCfa" INTEGER NOT NULL DEFAULT 0,
  "status"       "ActivationDebtStatus" NOT NULL DEFAULT 'OUTSTANDING',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivationDebt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivationDebt_eventId_key" ON "ActivationDebt"("eventId");
CREATE INDEX "ActivationDebt_tenantId_status_idx" ON "ActivationDebt"("tenantId", "status");
ALTER TABLE "ActivationDebt" ADD CONSTRAINT "ActivationDebt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivationDebt" ADD CONSTRAINT "ActivationDebt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActivationRecovery" (
  "id"        TEXT NOT NULL,
  "debtId"    TEXT NOT NULL,
  "payoutId"  TEXT,
  "amountCfa" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivationRecovery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActivationRecovery_debtId_idx" ON "ActivationRecovery"("debtId");
ALTER TABLE "ActivationRecovery" ADD CONSTRAINT "ActivationRecovery_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "ActivationDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivationRecovery" ADD CONSTRAINT "ActivationRecovery_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
