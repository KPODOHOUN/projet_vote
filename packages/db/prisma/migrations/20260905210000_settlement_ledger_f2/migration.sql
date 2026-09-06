ALTER TABLE "OrganizerWallet" RENAME COLUMN "pendingCfa" TO "heldCfa";
ALTER TABLE "OrganizerWallet" RENAME COLUMN "availableCfa" TO "withdrawableCfa";
ALTER TABLE "Event" ADD COLUMN "heldBps" INTEGER;
ALTER TYPE "WalletLedgerKind" ADD VALUE 'HELD_ALLOCATION';
ALTER TYPE "WalletLedgerKind" ADD VALUE 'HELD_RELEASE';

-- Backfill: events already ACTIVE at deploy time never re-run the activation
-- transition that snapshots "heldBps", so they would keep a NULL rate forever
-- (treated as 0 = no reserve at all). Freeze them at the platform default
-- (DEFAULT_SETTLEMENT_HELD_BPS = 5000, apps/api/src/common/platform-settings.ts).
-- No-op when no event is currently ACTIVE.
UPDATE "Event" SET "heldBps" = 5000 WHERE "status" = 'ACTIVE' AND "heldBps" IS NULL;
