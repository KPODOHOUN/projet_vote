-- CreateEnum
CREATE TYPE "AccountPlanType" AS ENUM ('STANDARD', 'PARTNER');

-- CreateEnum
CREATE TYPE "AccountPlanStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountPartnerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_EXPIRING_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_PARTNER_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_PARTNER_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_PARTNER_REQUEST_REJECTED';

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'SUBSCRIPTION';

-- CreateTable
CREATE TABLE "SubscriptionPricing" (
    "id" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "priceCfa" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planType" "AccountPlanType" NOT NULL,
    "status" "AccountPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "priceCfa" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "frozenCommissionBps" INTEGER NOT NULL,
    "partnerCommissionBps" INTEGER,
    "paymentTransactionId" TEXT,
    "accountPartnerRequestId" TEXT,
    "reminderJ7Sent" BOOLEAN NOT NULL DEFAULT false,
    "reminderJ3Sent" BOOLEAN NOT NULL DEFAULT false,
    "reminderJ1Sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountPartnerRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "AccountPartnerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "durationMonths" INTEGER NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "contractVersion" TEXT NOT NULL,
    "contractAcceptedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "negotiatedCommissionBps" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPartnerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPricing_durationMonths_key" ON "SubscriptionPricing"("durationMonths");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSubscription_paymentTransactionId_key" ON "AccountSubscription"("paymentTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSubscription_accountPartnerRequestId_key" ON "AccountSubscription"("accountPartnerRequestId");

-- CreateIndex
CREATE INDEX "AccountSubscription_tenantId_status_expiresAt_idx" ON "AccountSubscription"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AccountSubscription_expiresAt_status_idx" ON "AccountSubscription"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "AccountPartnerRequest_tenantId_status_idx" ON "AccountPartnerRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountPartnerRequest_status_createdAt_idx" ON "AccountPartnerRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_partnerOfferTierId_fkey" FOREIGN KEY ("partnerOfferTierId") REFERENCES "PartnerOfferTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_offerTierId_fkey" FOREIGN KEY ("offerTierId") REFERENCES "PartnerOfferTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSubscription" ADD CONSTRAINT "AccountSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSubscription" ADD CONSTRAINT "AccountSubscription_accountPartnerRequestId_fkey" FOREIGN KEY ("accountPartnerRequestId") REFERENCES "AccountPartnerRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPartnerRequest" ADD CONSTRAINT "AccountPartnerRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
