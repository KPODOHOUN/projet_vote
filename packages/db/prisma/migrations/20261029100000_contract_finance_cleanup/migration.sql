-- Contrat de concours, historique des taux de commission, numéro de retrait figé,
-- archive ; retrait de l'abonnement, du forfait d'activation, de l'offre
-- partenaire, de l'offre EXTERNAL et des anciens versements par période.

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('PENDING_SIGNATURE', 'SIGNED', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "AuthOtpPurpose" ADD VALUE 'CONTRACT_SIGNATURE';
-- AlterEnum
ALTER TYPE "WalletLedgerKind" ADD VALUE 'TICKET_CREDIT';

-- CreateTable
CREATE TABLE "CommissionRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bps" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRate_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "EventContract" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "snapshot" JSONB NOT NULL,
    "contentText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "signedByUserId" TEXT,
    "signerName" TEXT,
    "signerEmail" TEXT,
    "signatureImage" TEXT,
    "otpVerifiedAt" TIMESTAMP(3),
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "supersededAt" TIMESTAMP(3),
    "signedPdf" BYTEA,
    "signedPdfSha256" TEXT,

    CONSTRAINT "EventContract_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LegacyArchive" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRate_tenantId_effectiveFrom_idx" ON "CommissionRate"("tenantId", "effectiveFrom");
-- CreateIndex
CREATE INDEX "EventContract_eventId_status_idx" ON "EventContract"("eventId", "status");
-- CreateIndex
CREATE INDEX "EventContract_tenantId_generatedAt_idx" ON "EventContract"("tenantId", "generatedAt");
-- CreateIndex
CREATE INDEX "LegacyArchive_source_idx" ON "LegacyArchive"("source");
-- CreateIndex
CREATE UNIQUE INDEX "LegacyArchive_source_sourceId_key" ON "LegacyArchive"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "CommissionRate" ADD CONSTRAINT "CommissionRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EventContract" ADD CONSTRAINT "EventContract_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EventContract" ADD CONSTRAINT "EventContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EventContract" ADD CONSTRAINT "EventContract_signedByUserId_fkey" FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Conservation : chaque ligne des fonctionnalités retirées est archivée en JSON
-- dans "LegacyArchive" AVANT toute suppression. Les clés de paiement chiffrées
-- des organisateurs ne sont pas conservées (seules leurs métadonnées le sont).
-- ---------------------------------------------------------------------------
INSERT INTO "LegacyArchive" ("id", "source", "sourceId", "payload")
SELECT 'arch_' || md5(src || ':' || sid), src, sid, payload FROM (
  SELECT 'AccountSubscription' AS src, "id" AS sid, to_jsonb(t) AS payload FROM "AccountSubscription" t
  UNION ALL SELECT 'AccountPartnerRequest', "id", to_jsonb(t) FROM "AccountPartnerRequest" t
  UNION ALL SELECT 'SubscriptionPricing', "id", to_jsonb(t) FROM "SubscriptionPricing" t
  UNION ALL SELECT 'Plan', "id", to_jsonb(t) FROM "Plan" t
  UNION ALL SELECT 'PartnerOfferTier', "id", to_jsonb(t) FROM "PartnerOfferTier" t
  UNION ALL SELECT 'PartnerRequest', "id", to_jsonb(t) FROM "PartnerRequest" t
  UNION ALL SELECT 'ActivationDebt', "id", to_jsonb(t) FROM "ActivationDebt" t
  UNION ALL SELECT 'ActivationRecovery', "id", to_jsonb(t) FROM "ActivationRecovery" t
  UNION ALL SELECT 'PayoutPeriod', "id", to_jsonb(t) FROM "PayoutPeriod" t
  UNION ALL SELECT 'Payout', "id", to_jsonb(t) FROM "Payout" t
  UNION ALL SELECT 'PayoutLine', "id", to_jsonb(t) FROM "PayoutLine" t
  UNION ALL SELECT 'TenantSecret', "id", jsonb_build_object('tenantId', "tenantId", 'key', "key", 'createdByUserId', "createdByUserId", 'createdAt', "createdAt", 'updatedAt', "updatedAt") FROM "TenantSecret"
  UNION ALL SELECT 'EventSecret', "id", jsonb_build_object('eventId', "eventId", 'key', "key", 'createdByUserId', "createdByUserId", 'createdAt', "createdAt", 'updatedAt', "updatedAt") FROM "EventSecret"
  UNION ALL SELECT 'Tenant.legacyColumns', "id", jsonb_build_object('offerType', "offerType", 'commissionBps', "commissionBps", 'fedapaySubAccountRef', "fedapaySubAccountRef", 'fedapaySubAccountSubmittedAt', "fedapaySubAccountSubmittedAt", 'fedapaySubAccountVerifiedAt', "fedapaySubAccountVerifiedAt", 'isPartner', "isPartner", 'partnerCommissionBps', "partnerCommissionBps") FROM "Tenant"
  UNION ALL SELECT 'Event.legacyColumns', "id", jsonb_build_object('activationPaidAt', "activationPaidAt", 'isPartnerEvent', "isPartnerEvent", 'partnerPlatformShareBps', "partnerPlatformShareBps", 'estimatedRevenueCfa', "estimatedRevenueCfa", 'partnerOfferTierId', "partnerOfferTierId") FROM "Event"
    WHERE "activationPaidAt" IS NOT NULL OR "isPartnerEvent" OR "partnerOfferTierId" IS NOT NULL
  UNION ALL SELECT 'PaymentTransaction.split', "id", jsonb_build_object('splitBeneficiaryRef', "splitBeneficiaryRef", 'splitAmountCfa', "splitAmountCfa") FROM "PaymentTransaction"
    WHERE "splitBeneficiaryRef" IS NOT NULL OR "splitAmountCfa" IS NOT NULL
) AS rows;

-- Les taux négociés existants deviennent la première ligne de l'historique.
INSERT INTO "CommissionRate" ("id", "tenantId", "bps", "effectiveFrom", "reason", "createdByUserId")
SELECT 'rate_' || md5("id"), "id", "commissionBps", now(), 'Reprise du taux négocié existant', 'system:migration'
FROM "Tenant" WHERE "commissionBps" IS NOT NULL;

-- Réglages des mécanismes retirés : archivés puis supprimés.
INSERT INTO "LegacyArchive" ("id", "source", "sourceId", "payload")
SELECT 'arch_' || md5('PlatformSetting:' || "key"), 'PlatformSetting', "key", to_jsonb(t) FROM "PlatformSetting" t
WHERE "key" IN ('commission_bps', 'activation_fee_cfa', 'partner_default_commission_bps',
  'offer1_external_enabled', 'offer2_escrow_enabled', 'offer1_commission_bps', 'offer1_commission_fixed_cfa',
  'offer2_retention_bps', 'offer2_per_vote_commission_enabled', 'offer2_per_vote_commission_bps',
  'psp_feexpay_supports_split', 'psp_fedapay_supports_split', 'psp_kkiapay_supports_split');
DELETE FROM "PlatformSetting"
WHERE "key" IN ('commission_bps', 'activation_fee_cfa', 'partner_default_commission_bps',
  'offer1_external_enabled', 'offer2_escrow_enabled', 'offer1_commission_bps', 'offer1_commission_fixed_cfa',
  'offer2_retention_bps', 'offer2_per_vote_commission_enabled', 'offer2_per_vote_commission_bps',
  'psp_feexpay_supports_split', 'psp_fedapay_supports_split', 'psp_kkiapay_supports_split');

-- Notifications des fonctionnalités retirées : archivées puis supprimées
-- (leur type disparaît de l'énumération).
INSERT INTO "LegacyArchive" ("id", "source", "sourceId", "payload")
SELECT 'arch_' || md5('Notification:' || "id"), 'Notification', "id", to_jsonb(t) FROM "Notification" t
WHERE "type"::text NOT IN ('PAYMENT_SUCCEEDED', 'INVITATION_ACCEPTED', 'EVENT_ACTIVATED');
DELETE FROM "Notification"
WHERE "type"::text NOT IN ('PAYMENT_SUCCEEDED', 'INVITATION_ACCEPTED', 'EVENT_ACTIVATED');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('PAYMENT_SUCCEEDED', 'INVITATION_ACCEPTED', 'EVENT_ACTIVATED', 'CONTRACT_SIGNED', 'COMMISSION_RATE_CHANGED', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'WITHDRAWAL_PAID');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AccountPartnerRequest" DROP CONSTRAINT "AccountPartnerRequest_tenantId_fkey";
-- DropForeignKey
ALTER TABLE "AccountSubscription" DROP CONSTRAINT "AccountSubscription_accountPartnerRequestId_fkey";
-- DropForeignKey
ALTER TABLE "AccountSubscription" DROP CONSTRAINT "AccountSubscription_planId_fkey";
-- DropForeignKey
ALTER TABLE "AccountSubscription" DROP CONSTRAINT "AccountSubscription_tenantId_fkey";
-- DropForeignKey
ALTER TABLE "ActivationDebt" DROP CONSTRAINT "ActivationDebt_eventId_fkey";
-- DropForeignKey
ALTER TABLE "ActivationDebt" DROP CONSTRAINT "ActivationDebt_tenantId_fkey";
-- DropForeignKey
ALTER TABLE "ActivationRecovery" DROP CONSTRAINT "ActivationRecovery_debtId_fkey";
-- DropForeignKey
ALTER TABLE "ActivationRecovery" DROP CONSTRAINT "ActivationRecovery_payoutId_fkey";
-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_partnerOfferTierId_fkey";
-- DropForeignKey
ALTER TABLE "EventSecret" DROP CONSTRAINT "EventSecret_eventId_fkey";
-- DropForeignKey
ALTER TABLE "PartnerRequest" DROP CONSTRAINT "PartnerRequest_eventId_fkey";
-- DropForeignKey
ALTER TABLE "PartnerRequest" DROP CONSTRAINT "PartnerRequest_offerTierId_fkey";
-- DropForeignKey
ALTER TABLE "PartnerRequest" DROP CONSTRAINT "PartnerRequest_tenantId_fkey";
-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_periodId_fkey";
-- DropForeignKey
ALTER TABLE "PayoutLine" DROP CONSTRAINT "PayoutLine_payoutId_fkey";
-- DropForeignKey
ALTER TABLE "TenantSecret" DROP CONSTRAINT "TenantSecret_tenantId_fkey";


-- AlterTable
ALTER TABLE "Event" DROP COLUMN "activationPaidAt",
DROP COLUMN "estimatedRevenueCfa",
DROP COLUMN "isPartnerEvent",
DROP COLUMN "partnerOfferTierId",
DROP COLUMN "partnerPlatformShareBps";
-- AlterTable
ALTER TABLE "PaymentTransaction" DROP COLUMN "splitAmountCfa",
DROP COLUMN "splitBeneficiaryRef";
-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "commissionBps",
DROP COLUMN "fedapaySubAccountRef",
DROP COLUMN "fedapaySubAccountSubmittedAt",
DROP COLUMN "fedapaySubAccountVerifiedAt",
DROP COLUMN "isPartner",
DROP COLUMN "offerType",
DROP COLUMN "partnerCommissionBps";
-- AlterTable
ALTER TABLE "WithdrawalRequest" ADD COLUMN     "payoutNetwork" TEXT,
ADD COLUMN     "payoutPhoneEnc" TEXT,
ADD COLUMN     "payoutPhoneLast4" TEXT;

-- DropTable
DROP TABLE "AccountPartnerRequest";
-- DropTable
DROP TABLE "AccountSubscription";
-- DropTable
DROP TABLE "ActivationDebt";
-- DropTable
DROP TABLE "ActivationRecovery";
-- DropTable
DROP TABLE "EventSecret";
-- DropTable
DROP TABLE "PartnerOfferTier";
-- DropTable
DROP TABLE "PartnerRequest";
-- DropTable
DROP TABLE "Payout";
-- DropTable
DROP TABLE "PayoutLine";
-- DropTable
DROP TABLE "PayoutPeriod";
-- DropTable
DROP TABLE "Plan";
-- DropTable
DROP TABLE "SubscriptionPricing";
-- DropTable
DROP TABLE "TenantSecret";

-- DropEnum
DROP TYPE "AccountPartnerRequestStatus";
-- DropEnum
DROP TYPE "AccountPlanStatus";
-- DropEnum
DROP TYPE "AccountPlanType";
-- DropEnum
DROP TYPE "ActivationDebtStatus";
-- DropEnum
DROP TYPE "PartnerRequestStatus";
-- DropEnum
DROP TYPE "PayoutKind";
-- DropEnum
DROP TYPE "PayoutPeriodStatus";
-- DropEnum
DROP TYPE "PayoutStatus";
-- DropEnum
DROP TYPE "TenantOfferType";
