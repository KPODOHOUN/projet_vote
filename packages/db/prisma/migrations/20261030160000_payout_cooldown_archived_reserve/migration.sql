-- Numéro de retrait : date du dernier changement (aucun retrait dans les 24 h
-- qui suivent) et notification dédiée.
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_DESTINATION_CHANGED';
ALTER TABLE "Tenant" ADD COLUMN "payoutUpdatedAt" TIMESTAMP(3);

-- Concours archivés directement depuis « en ligne » (ancien comportement de la
-- suppression) : ils n'avaient pas de date de clôture, donc leur réserve ne se
-- libérait jamais. On prend la date d'archivage comme date de clôture.
UPDATE "Event" e
SET "closedAt" = e."updatedAt"
WHERE e."status" = 'ARCHIVED'
  AND e."closedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "WalletLedgerEntry" w
    WHERE w."eventId" = e."id" AND w."kind" = 'HELD_ALLOCATION'
  );
