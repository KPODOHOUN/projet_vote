-- Denormalize payment confirmation onto Vote so result tallies are a single
-- indexed scan (count paid, non-cancelled votes) instead of an unbounded
-- `id IN (...)` join against PaymentTransaction.

ALTER TABLE "Vote" ADD COLUMN "paidAt" TIMESTAMP(3);

-- Backfill: a vote is "paid" when its VOTE-purpose payment reached SUCCEEDED.
-- Use the payment's updatedAt as the confirmation time (best available proxy).
UPDATE "Vote" v
SET "paidAt" = p."updatedAt"
FROM "PaymentTransaction" p
WHERE p."voteId" = v."id"
  AND p."purpose" = 'VOTE'
  AND p."status" = 'SUCCEEDED'
  AND v."paidAt" IS NULL;

-- Index supporting the tally query: per event/candidate, filter on paidAt + cancelledAt.
CREATE INDEX "Vote_eventId_candidateId_paidAt_cancelledAt_idx"
  ON "Vote" ("eventId", "candidateId", "paidAt", "cancelledAt");
