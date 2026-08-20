-- Park Offer 1 (External) during the Escrow test phase.
-- Offer 2 remains the only signup / production-shaped path until product reopens Offer 1.
INSERT INTO "PlatformSetting" ("id", "key", "value", "createdAt", "updatedAt", "updatedByUserId")
VALUES
  ('setting_offer1_park_20260730', 'offer1_external_enabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system:migration'),
  ('setting_offer2_live_20260730', 'offer2_escrow_enabled', 'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system:migration')
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "updatedAt" = CURRENT_TIMESTAMP,
    "updatedByUserId" = 'system:migration';
