-- Partner offer tiers (revenue-based platform share grid)
CREATE TABLE "PartnerOfferTier" (
  "id"               TEXT NOT NULL,
  "label"            TEXT NOT NULL,
  "minRevenueCfa"    INTEGER NOT NULL,
  "maxRevenueCfa"    INTEGER,
  "platformShareBps" INTEGER NOT NULL,
  "sortOrder"        INTEGER NOT NULL DEFAULT 0,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerOfferTier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerOfferTier_sortOrder_idx" ON "PartnerOfferTier"("sortOrder");

-- Event: partner flag + negotiated terms
ALTER TABLE "Event" ADD COLUMN "isPartnerEvent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "partnerPlatformShareBps" INTEGER;
ALTER TABLE "Event" ADD COLUMN "estimatedRevenueCfa" INTEGER;
ALTER TABLE "Event" ADD COLUMN "partnerOfferTierId" TEXT;

-- Partner request: estimated revenue for tier matching
ALTER TABLE "PartnerRequest" ADD COLUMN "estimatedRevenueCfa" INTEGER;
ALTER TABLE "PartnerRequest" ADD COLUMN "offerTierId" TEXT;
