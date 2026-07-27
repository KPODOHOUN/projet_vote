-- Multi-PSP: PaymentTransaction.provider becomes a typed enum, and tenants/events
-- gain an optional provider override (organizer routing choice). Existing rows use
-- the literal 'feexpay' string and are backfilled to FEEXPAY before the type change.
CREATE TYPE "PaymentProvider" AS ENUM ('FEEXPAY', 'KKIAPAY');

UPDATE "PaymentTransaction" SET "provider" = 'FEEXPAY' WHERE "provider" = 'feexpay';

ALTER TABLE "PaymentTransaction" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "PaymentTransaction"
  ALTER COLUMN "provider" TYPE "PaymentProvider" USING ("provider"::"PaymentProvider");

ALTER TABLE "Tenant" ADD COLUMN "provider" "PaymentProvider";
ALTER TABLE "Event"  ADD COLUMN "provider" "PaymentProvider";
