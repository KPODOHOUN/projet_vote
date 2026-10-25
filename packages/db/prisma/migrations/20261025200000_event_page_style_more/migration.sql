-- Trois styles de page supplémentaires (additif).
ALTER TYPE "EventPageStyle" ADD VALUE IF NOT EXISTS 'COURONNE';
ALTER TYPE "EventPageStyle" ADD VALUE IF NOT EXISTS 'MAGAZINE';
ALTER TYPE "EventPageStyle" ADD VALUE IF NOT EXISTS 'POP';
