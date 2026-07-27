-- VaultEntry: hidden, encrypted forensic copy of every Vote (and its linked
-- PaymentTransaction) that a platform admin cancels or hard-deletes. The
-- live tables are purged; the vault is the ONLY surviving trace. Encrypted
-- with a dedicated key (API_VAULT_SECRET_KEY) distinct from the organizer
-- secrets key, AES-256-GCM, per-row IV. Read access restricted to
-- PLATFORM_SUPER_ADMIN behind a fresh-OTP gate.

CREATE TABLE "VaultEntry" (
  "id"                TEXT PRIMARY KEY,
  -- Marker for what was vaulted. For now: "vote_cancelled" or "vote_deleted".
  "kind"              TEXT NOT NULL,
  -- Plaintext metadata kept un-encrypted so the index/list view can show
  -- a coarse summary without unlocking the OTP (date, tenant, event).
  "tenantId"          TEXT NOT NULL,
  "eventId"           TEXT NOT NULL,
  "originalVoteId"    TEXT NOT NULL,
  "amountCfa"         INTEGER NOT NULL,
  "occurredAt"        TIMESTAMP(3) NOT NULL,
  "actorUserId"       TEXT,
  -- AES-256-GCM payload : full JSON snapshot of Vote + PaymentTransaction
  -- (providerRef, voterPhoneHash, voterPhoneLast4, commissionCfa, etc.).
  "cipherText"        TEXT NOT NULL,
  "iv"                TEXT NOT NULL,
  "authTag"           TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "VaultEntry_tenantId_occurredAt_idx"
  ON "VaultEntry" ("tenantId", "occurredAt");
CREATE INDEX "VaultEntry_eventId_idx"
  ON "VaultEntry" ("eventId");
CREATE UNIQUE INDEX "VaultEntry_originalVoteId_kind_key"
  ON "VaultEntry" ("originalVoteId", "kind");
