-- Backend completion: organizer commission, per-event secrets, invitations.

-- Tenant: organizer-level commission override (negotiated multi-event rate).
ALTER TABLE "Tenant" ADD COLUMN "commissionBps" INTEGER;

-- Invitation status enum.
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- Per-event encrypted secret (e.g. the event's own FeexPay account).
CREATE TABLE "EventSecret" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "cipherText" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventSecret_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventSecret_eventId_key_key" ON "EventSecret"("eventId", "key");
CREATE INDEX "EventSecret_eventId_idx" ON "EventSecret"("eventId");
ALTER TABLE "EventSecret" ADD CONSTRAINT "EventSecret_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Member invitation (organizer invites a teammate).
CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_tenantId_status_idx" ON "Invitation"("tenantId", "status");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
