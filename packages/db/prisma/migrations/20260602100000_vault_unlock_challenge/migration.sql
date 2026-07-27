CREATE TABLE "VaultUnlockChallenge" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "codeHash"    TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "consumedAt"  TIMESTAMP(3),
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "VaultUnlockChallenge_userId_expiresAt_idx"
  ON "VaultUnlockChallenge" ("userId", "expiresAt");
