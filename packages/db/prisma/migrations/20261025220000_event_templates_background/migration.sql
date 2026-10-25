-- Quatre styles de page de plus et choix du fond des bandeaux (additif).
ALTER TYPE "EventPageStyle" ADD VALUE IF NOT EXISTS 'TERROIR';
ALTER TYPE "EventPageStyle" ADD VALUE IF NOT EXISTS 'STADE';
ALTER TYPE "EventPageStyle" ADD VALUE IF NOT EXISTS 'LINEUP';
ALTER TYPE "EventPageStyle" ADD VALUE IF NOT EXISTS 'DIPLOME';

CREATE TYPE "EventHeroBackground" AS ENUM ('IMAGE', 'COLOR');
ALTER TABLE "Event" ADD COLUMN "heroBackground" "EventHeroBackground" NOT NULL DEFAULT 'IMAGE';
