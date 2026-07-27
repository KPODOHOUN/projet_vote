-- Event becomes the public "platform" unit: slug is now globally unique.
-- DropIndex (per-tenant uniqueness replaced by global uniqueness)
DROP INDEX "Event_tenantId_slug_key";

-- AlterTable: per-event branding + voting rule (null = inherit from organizer)
ALTER TABLE "Event" ADD COLUMN "tagline" TEXT,
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "brandColor" TEXT,
ADD COLUMN "voteUnitPriceCfa" INTEGER;

-- AlterTable: organizer-level branding defaults
ALTER TABLE "Tenant" ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "brandColor" TEXT;

-- CreateIndex: global uniqueness on event slug
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
