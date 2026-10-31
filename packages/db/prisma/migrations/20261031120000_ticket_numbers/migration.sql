-- Numéro lisible des billets (N° 0042), unique par type de billet, attribué au paiement.
ALTER TABLE "TicketType" ADD COLUMN "issuedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN "number" INTEGER;

-- Billets déjà payés : numérotés dans l'ordre de paiement.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "ticketTypeId" ORDER BY "paidAt" NULLS LAST, "createdAt", id) AS n
  FROM "Ticket"
  WHERE status IN ('PAID', 'CONFIRMED', 'USED')
)
UPDATE "Ticket" t SET "number" = ranked.n FROM ranked WHERE t.id = ranked.id;

UPDATE "TicketType" tt
SET "issuedCount" = COALESCE((SELECT MAX("number") FROM "Ticket" t WHERE t."ticketTypeId" = tt.id), 0);

CREATE UNIQUE INDEX "Ticket_ticketTypeId_number_key" ON "Ticket"("ticketTypeId", "number");
