import { createHash, createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";

// Ancien schéma (SHA-256, sel public) : partagé avec la migration
// 20260601100000_hash_voter_phone. Seulement relu pour les votes existants —
// il se renverse en quelques millisecondes avec les 4 derniers chiffres.
const LEGACY_VOTER_PHONE_SALT = "votezpro:phone:";
const HASH_PREFIX = "v2:";

// Clé dédiée, dérivée du secret du coffre (séparation de domaine) : sans elle,
// l'empreinte d'un numéro ne peut pas être recalculée hors du serveur.
const voterPhoneKey = createHmac("sha256", env.API_VAULT_SECRET_KEY).update("voter-phone-hash:v2").digest();

/**
 * Empreinte à clé secrète du numéro du votant. Le numéro brut n'est JAMAIS
 * stocké (vie privée : les votants n'ont pas de compte) ; l'empreinte sert
 * seulement à retrouver un vote lors du suivi du paiement. Les 4 derniers
 * chiffres sont gardés à part pour le support.
 */
export function hashVoterPhone(phone: string): string {
  return HASH_PREFIX + createHmac("sha256", voterPhoneKey).update(phone).digest("hex");
}

function legacyHashVoterPhone(phone: string): string {
  return createHash("sha256").update(`${LEGACY_VOTER_PHONE_SALT}${phone}`).digest("hex");
}

/** Le numéro correspond-il à l'empreinte stockée (nouveau ou ancien schéma) ? Comparaison à temps constant. */
export function voterPhoneMatches(phone: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const expected = storedHash.startsWith(HASH_PREFIX) ? hashVoterPhone(phone) : legacyHashVoterPhone(phone);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function voterPhoneLast4(phone: string): string {
  return phone.slice(-4);
}
