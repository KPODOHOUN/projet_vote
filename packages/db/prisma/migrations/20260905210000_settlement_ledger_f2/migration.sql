ALTER TABLE "OrganizerWallet" RENAME COLUMN "pendingCfa" TO "heldCfa";
ALTER TABLE "OrganizerWallet" RENAME COLUMN "availableCfa" TO "withdrawableCfa";
ALTER TABLE "Event" ADD COLUMN "heldBps" INTEGER;
ALTER TYPE "WalletLedgerKind" ADD VALUE 'HELD_ALLOCATION';
ALTER TYPE "WalletLedgerKind" ADD VALUE 'HELD_RELEASE';
