-- Les billets d'un paiement sont retrouvés à chaque confirmation, échec ou abandon :
-- sans index, chaque passage parcourait toute la table.
CREATE INDEX "Ticket_paymentTransactionId_idx" ON "Ticket"("paymentTransactionId");
