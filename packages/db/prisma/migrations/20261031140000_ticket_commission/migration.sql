-- Commission de la plateforme sur les billets (10 % par défaut), figée par le contrat du concours.
ALTER TABLE "Event" ADD COLUMN "ticketCommissionBps" INTEGER;

-- Concours déjà publiés : leur contrat signé prévoit un taux unique sur tous les
-- paiements (votes et billets). On le respecte en figeant le même taux.
UPDATE "Event"
SET "ticketCommissionBps" = "commissionBps"
WHERE "commissionBps" IS NOT NULL AND "status" <> 'DRAFT';
