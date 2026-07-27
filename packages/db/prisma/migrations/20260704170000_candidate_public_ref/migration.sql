-- Identifiant public non devinable pour les liens candidat + numéro d'affichage optionnel.
ALTER TABLE "Candidate" ADD COLUMN "publicRef" TEXT;

UPDATE "Candidate"
SET "publicRef" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
WHERE "publicRef" IS NULL;

ALTER TABLE "Candidate" ALTER COLUMN "publicRef" SET NOT NULL;
CREATE UNIQUE INDEX "Candidate_publicRef_key" ON "Candidate"("publicRef");

ALTER TABLE "Candidate" ALTER COLUMN "number" DROP NOT NULL;
