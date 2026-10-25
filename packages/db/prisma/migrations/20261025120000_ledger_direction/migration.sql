-- ADR-021 : sens et compartiment des écritures du journal wallet.
-- Additif : deux enums, deux colonnes nullables, backfill déterministe.
-- Les montants ne sont pas touchés. Retour arrière : DROP COLUMN + DROP TYPE.

CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "LedgerBucket" AS ENUM ('HELD', 'WITHDRAWABLE');

ALTER TABLE "WalletLedgerEntry"
  ADD COLUMN "direction" "LedgerDirection",
  ADD COLUMN "bucket" "LedgerBucket";

-- Sens et compartiment fixés par le kind.
UPDATE "WalletLedgerEntry" SET "direction" = 'CREDIT', "bucket" = 'HELD'
  WHERE "kind" = 'HELD_ALLOCATION';
UPDATE "WalletLedgerEntry" SET "direction" = 'CREDIT', "bucket" = 'WITHDRAWABLE'
  WHERE "kind" IN ('TOPUP_CREDIT', 'HELD_RELEASE');
UPDATE "WalletLedgerEntry" SET "direction" = 'DEBIT', "bucket" = 'HELD'
  WHERE "kind" = 'RETENTION_DEBIT';
UPDATE "WalletLedgerEntry" SET "direction" = 'DEBIT', "bucket" = 'WITHDRAWABLE'
  WHERE "kind" = 'WITHDRAWAL_DEBIT';

-- VOTE_CREDIT : toujours un crédit. Disponible si une part réserve existe
-- pour le même paiement (creditSplit) ; sinon compartiment inconnu.
UPDATE "WalletLedgerEntry" SET "direction" = 'CREDIT'
  WHERE "kind" = 'VOTE_CREDIT';
UPDATE "WalletLedgerEntry" v SET "bucket" = 'WITHDRAWABLE'
  WHERE v."kind" = 'VOTE_CREDIT'
    AND v."paymentId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "WalletLedgerEntry" h
      WHERE h."kind" = 'HELD_ALLOCATION'
        AND h."walletId" = v."walletId"
        AND h."paymentId" = v."paymentId"
    );

-- ADJUSTMENT : seule la restitution d'un retrait rejeté est décidable.
UPDATE "WalletLedgerEntry" SET "direction" = 'CREDIT', "bucket" = 'WITHDRAWABLE'
  WHERE "kind" = 'ADJUSTMENT'
    AND ("withdrawalId" IS NOT NULL OR "note" LIKE 'Rejet retrait%');
