-- Per-event public layout template for /e/{slug}: how candidates are presented.
CREATE TYPE "EventLayout" AS ENUM ('GRID', 'LIST', 'SPOTLIGHT');

ALTER TABLE "Event" ADD COLUMN "layout" "EventLayout" NOT NULL DEFAULT 'GRID';
