-- Personnalisation de la mini-plateforme (additif, sans perte) :
-- image de couverture, style de page et police des titres.
CREATE TYPE "EventPageStyle" AS ENUM ('AFFICHE', 'SOIREE', 'BILLET');
CREATE TYPE "EventFontStyle" AS ENUM ('FESTIVAL', 'GALA', 'CLASSIQUE');

ALTER TABLE "Event"
  ADD COLUMN "coverUrl" TEXT,
  ADD COLUMN "pageStyle" "EventPageStyle" NOT NULL DEFAULT 'AFFICHE',
  ADD COLUMN "fontStyle" "EventFontStyle" NOT NULL DEFAULT 'FESTIVAL';
