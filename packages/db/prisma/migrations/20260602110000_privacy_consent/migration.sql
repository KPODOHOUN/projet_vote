-- Privacy consent ledger. Every public vote MUST be preceded by a recorded
-- consent against the current PrivacyPolicy version. Stored independently
-- of Vote (no FK) so a deleted vote does not orphan the legal proof.
CREATE TABLE "PrivacyConsent" (
  "id"               TEXT PRIMARY KEY,
  "policyVersion"    TEXT NOT NULL,
  "voterPhoneHash"   TEXT NOT NULL,
  "tenantSlug"       TEXT NOT NULL,
  "eventSlug"        TEXT NOT NULL,
  "userAgent"        TEXT,
  "ipHash"           TEXT,
  "acceptedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PrivacyConsent_voterPhoneHash_idx"
  ON "PrivacyConsent" ("voterPhoneHash");
CREATE INDEX "PrivacyConsent_tenantSlug_eventSlug_idx"
  ON "PrivacyConsent" ("tenantSlug", "eventSlug");
CREATE INDEX "PrivacyConsent_acceptedAt_idx"
  ON "PrivacyConsent" ("acceptedAt");
