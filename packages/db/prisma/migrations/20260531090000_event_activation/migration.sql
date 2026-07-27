-- Event activation monetization: paying the activation fee unlocks ACTIVE.

-- Payment purpose: a vote payment or an event activation fee.
CREATE TYPE "PaymentPurpose" AS ENUM ('VOTE', 'ACTIVATION');
ALTER TABLE "PaymentTransaction" ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'VOTE';

-- Event activation entitlement (free quota or paid forfait).
ALTER TABLE "Event" ADD COLUMN "activationPaidAt" TIMESTAMP(3),
ADD COLUMN "freeActivationUsed" BOOLEAN NOT NULL DEFAULT false;
