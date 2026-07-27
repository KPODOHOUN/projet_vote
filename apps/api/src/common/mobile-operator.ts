import { BadRequestException } from "@nestjs/common";
import { env } from "../config/env";

/** Chiffres uniquement (ex. 2290166000000). */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Indicatifs pays africains à 3 chiffres (ITU) — faits stables, utilisés pour
 * reconnaître un numéro DÉJÀ international saisi sans « + » (ex. "2250102030405"
 * en Côte d'Ivoire). On se limite volontairement aux indicatifs à 3 chiffres
 * (22x/23x/24x/25x/26x) : ils couvrent toute la zone des PSP mobile money et
 * évitent l'ambiguïté des indicatifs à 2 chiffres (20 Égypte, 27 Afrique du Sud)
 * avec un numéro local.
 */
const AFRICAN_COUNTRY_CODES_3: readonly string[] = [
  "211", "212", "213", "216", "218", "220", "221", "222", "223", "224",
  "225", "226", "227", "228", "229", "230", "231", "232", "233", "234",
  "235", "236", "237", "238", "239", "240", "241", "242", "243", "244",
  "245", "248", "249", "250", "251", "252", "253", "254", "255", "256",
  "257", "258", "260", "261", "262", "263", "264", "265", "266", "267",
  "268", "269"
];

function startsWithKnownCountryCode(digits: string): boolean {
  return AFRICAN_COUNTRY_CODES_3.some((cc) => digits.startsWith(cc));
}

/**
 * Numéro au format international attendu par les PSP (sans « + »), pour toute
 * l'Afrique.
 *
 * Règles (dans l'ordre) :
 *   1. « + » ou « 00 » en tête → numéro explicitement international → on le
 *      conserve tel quel (après retrait du préfixe international).
 *   2. « 0 » en tête → préfixe national → remplacé par l'indicatif par défaut.
 *   3. Commence par un indicatif pays africain connu (ex. 225…) → conservé.
 *   4. Sinon (numéro local nu) → on préfixe l'indicatif par défaut.
 *
 * L'indicatif par défaut ne s'applique donc JAMAIS à un numéro déjà international.
 */
export function normalizePayinPhone(phone: string, defaultCountryCode?: string): string {
  const cc = (defaultCountryCode ?? env.PLATFORM_DEFAULT_COUNTRY_CODE).replace(/\D/g, "");
  const trimmed = phone.trim();
  const hadPlus = trimmed.startsWith("+");
  const digits = normalizePhoneDigits(trimmed);

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }
  if (hadPlus) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return `${cc}${digits.slice(1)}`;
  }
  if (startsWithKnownCountryCode(digits)) {
    return digits;
  }
  return `${cc}${digits}`;
}

/**
 * Détection opérateur Mobile Money — heuristique Bénin (indicatif 229) UNIQUEMENT,
 * utilisée en dernier recours quand le client ne fournit pas d'opérateur explicite.
 * MTN : 016/017/014/015 — Moov : 019/010. Pour les autres pays, l'opérateur DOIT
 * être fourni explicitement (voir resolvePayinOperator).
 */
export function detectMobileOperator(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  const isBenin = digits.startsWith("229");
  const local = digits.startsWith("229")
    ? digits.slice(3)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  if (isBenin && (local.startsWith("019") || local.startsWith("010"))) return "moov";
  return "mtn";
}

/** Liste des réseaux mobile money acceptés (minuscules), issue de la config. */
export function supportedOperators(): string[] {
  return env.PSP_SUPPORTED_OPERATORS.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isSupportedOperator(operator: string): boolean {
  return supportedOperators().includes(operator.trim().toLowerCase());
}

/**
 * Résout le code opérateur à transmettre au PSP.
 *   - Opérateur explicite : validé (format + liste blanche) — un code inconnu
 *     est refusé par un 400 AVANT d'atteindre l'URL du PSP (anti-injection).
 *   - Sinon : détection Bénin par défaut (compat ascendante mono-pays).
 */
export function resolvePayinOperator(explicit: string | undefined, phone: string): string {
  if (explicit && explicit.trim()) {
    const operator = explicit.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,20}$/.test(operator) || !isSupportedOperator(operator)) {
      throw new BadRequestException(
        `Opérateur mobile money non supporté : « ${explicit} ». Réseaux acceptés : ${supportedOperators().join(", ")}.`
      );
    }
    return operator;
  }
  return detectMobileOperator(phone);
}
