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

  let international: string;
  if (digits.startsWith("00")) {
    international = digits.slice(2);
  } else if (hadPlus || startsWithKnownCountryCode(digits)) {
    international = digits;
  } else if (digits.startsWith("0") && !KEEPS_LEADING_ZERO.has(cc)) {
    international = `${cc}${digits.slice(1)}`;
  } else {
    international = `${cc}${digits}`;
  }
  const normalized = toBeninTenDigits(international);
  if (normalized.startsWith("229") && !/^22901\d{8}$/.test(normalized)) {
    throw new BadRequestException("Numéro béninois invalide : 10 chiffres commençant par 01 (ex. 01 97 00 00 00).");
  }
  return normalized;
}

/**
 * Pays où le « 0 » de tête fait partie du numéro (pas un préfixe national) :
 * Bénin depuis le 30/11/2024 (01 + ancien numéro), Côte d'Ivoire depuis 2021.
 */
const KEEPS_LEADING_ZERO: ReadonlySet<string> = new Set(["229", "225"]);

/**
 * Bénin : un ancien numéro à 8 chiffres devient « 01 » + ce numéro
 * (+229 01 XX XX XX XX). Les PSP refusent désormais l'ancien format.
 */
function toBeninTenDigits(international: string): string {
  if (international.startsWith("229") && international.length === 11) {
    return `22901${international.slice(3)}`;
  }
  return international;
}

/** Liste des réseaux mobile money acceptés (minuscules), issue de la config. */
export function supportedOperators(): string[] {
  return env.PSP_SUPPORTED_OPERATORS.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Réseau choisi par le payeur, validé pour le prestataire qui encaisse.
 * Obligatoire : depuis les numéros béninois à 10 chiffres (01 + ancien numéro),
 * le préfixe ne dit plus le réseau, et un réseau deviné envoie la demande au
 * mauvais opérateur. Un code inconnu est refusé par un 400 AVANT d'atteindre
 * l'URL du PSP (anti-injection), sans recopier la saisie dans le message.
 */
export function resolvePayinNetwork(raw: string | undefined, provider: string): string {
  const accepted = payinNetworksFor(provider);
  if (accepted.length === 0) {
    throw new BadRequestException("Aucun réseau Mobile Money n'est disponible pour ce paiement.");
  }
  const list = accepted.map((network) => network.toUpperCase()).join(", ");
  const network = raw?.trim().toLowerCase() ?? "";
  if (!network) {
    throw new BadRequestException(`Choisissez votre réseau Mobile Money (${list}).`);
  }
  const wellFormed = /^[a-z][a-z0-9_]{1,20}$/.test(network);
  if (!wellFormed || !accepted.includes(network)) {
    const shown = wellFormed ? network.toUpperCase() : "choisi";
    throw new BadRequestException(`Le réseau ${shown} n'est pas accepté pour ce paiement. Réseaux acceptés : ${list}.`);
  }
  return network;
}

/**
 * Réseaux qu'un prestataire sait réellement débiter (codes vérifiés dans sa doc),
 * limités à la liste blanche de la plateforme. FedaPay ne publie aucun code
 * Celtiis. Un prestataire inconnu ne débite aucun réseau.
 */
const PROVIDER_NETWORKS: Readonly<Record<string, readonly string[]>> = {
  FEEXPAY: ["mtn", "moov", "celtiis"],
  FEDAPAY: ["mtn", "moov"]
};

export function payinNetworksFor(provider: string): string[] {
  const known = PROVIDER_NETWORKS[provider];
  const allowed = supportedOperators();
  return known ? allowed.filter((network) => known.includes(network)) : [];
}
