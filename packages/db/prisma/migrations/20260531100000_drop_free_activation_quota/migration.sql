-- No free activation quota: every event must pay the forfait to be activated.
ALTER TABLE "Event" DROP COLUMN "freeActivationUsed";
