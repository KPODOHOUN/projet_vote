-- Privacy policy acceptance moves to organizer onboarding only.
-- The voter journey no longer records any consent, so the per-vote consent
-- ledger is removed and acceptance is captured once on the owner's User row.

-- AlterTable: capture acceptance at account creation.
ALTER TABLE "User" ADD COLUMN "privacyPolicyVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);

-- DropTable: the voter-side consent ledger is gone.
DROP TABLE "PrivacyConsent";
