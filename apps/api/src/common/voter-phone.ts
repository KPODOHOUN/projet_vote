import { createHash } from "crypto";

// Salt prefix shared with the DB backfill migration — keep both in sync if it
// ever changes (migration 20260601100000_hash_voter_phone uses the same string).
const VOTER_PHONE_SALT = "votezpro:phone:";

/**
 * One-way salted hash of a voter phone number. The raw number is NEVER stored
 * (privacy / RGPD — voters have no account, so the hash is the only identifier
 * used to match a voter back to their vote when checking payment status). Only
 * the last 4 digits are kept separately, for support/display.
 */
export function hashVoterPhone(phone: string): string {
  return createHash("sha256").update(`${VOTER_PHONE_SALT}${phone}`).digest("hex");
}

export function voterPhoneLast4(phone: string): string {
  return phone.slice(-4);
}
