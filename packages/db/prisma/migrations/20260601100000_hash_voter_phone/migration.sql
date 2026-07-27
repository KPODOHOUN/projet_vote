-- Privacy / RGPD: stop persisting the raw voter phone number. Keep only a
-- salted SHA-256 hash (matching) + the last 4 digits (support/display).

-- pgcrypto provides digest() for the backfill below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Vote" ADD COLUMN "voterPhoneLast4" TEXT;

-- Backfill from the existing plaintext column before dropping it. The salt
-- prefix MUST match src/common/voter-phone.ts (`votezpro:phone:`).
UPDATE "Vote" SET
  "voterPhoneHash" = COALESCE(
    "voterPhoneHash",
    encode(digest('votezpro:phone:' || "voterPhone", 'sha256'), 'hex')
  ),
  "voterPhoneLast4" = right("voterPhone", 4)
WHERE "voterPhone" IS NOT NULL;

ALTER TABLE "Vote" DROP COLUMN "voterPhone";
