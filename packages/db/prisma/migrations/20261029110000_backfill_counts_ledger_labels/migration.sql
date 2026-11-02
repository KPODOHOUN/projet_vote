-- Correction des lignes existantes (spec 2026-10-28, §7 points 4, 5 et 9).
-- Migration séparée : la valeur 'TICKET_CREDIT' ajoutée par la migration précédente
-- ne peut pas être utilisée dans la même transaction que son ADD VALUE.

-- 5. Les paiements de votes créés avant la correction gardaient votesCount = 1 quelle
--    que soit la quantité achetée : on recopie la quantité du vote lié.
UPDATE "PaymentTransaction" pt
SET "votesCount" = v."votesCount"
FROM "Vote" v
WHERE pt."voteId" = v."id"
  AND pt."purpose" IN ('VOTE', 'ORGANIZER_VOTE_TOPUP')
  AND pt."votesCount" <> v."votesCount";

-- 4. Les billets étaient crédités au portefeuille comme « Crédit vote ».
UPDATE "WalletLedgerEntry" e
SET "kind" = 'TICKET_CREDIT', "note" = 'Billets'
FROM "PaymentTransaction" pt
WHERE e."paymentId" = pt."id"
  AND pt."purpose" = 'TICKET'
  AND e."kind" = 'VOTE_CREDIT';

-- 9. Libellés internes (« escrow », « top-up ») remplacés par ceux du code actuel.
UPDATE "WalletLedgerEntry" SET "note" = 'Votes'
WHERE "kind" = 'VOTE_CREDIT' AND "note" = 'Crédit vote (escrow)';
UPDATE "WalletLedgerEntry" SET "note" = 'Votes ajoutés par l''organisateur'
WHERE "kind" = 'TOPUP_CREDIT' AND "note" = 'Crédit top-up orga (escrow)';
