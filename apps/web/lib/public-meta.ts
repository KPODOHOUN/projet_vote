import { translate, translateVars, type Locale } from "./i18n";
import { formatCfa, formatEventDate } from "./format";

/**
 * Description publique vraie et localisée (7.11-g) : seulement ce qui est connu
 * (prix, date de fin). Aucun mot du registre « sécurisé », « en direct ».
 */
export function publicVoteDescription(
  event: { voteUnitPriceCfa: number | null; endsAt: string },
  locale: Locale
): string {
  const parts = [translate(locale, "meta.hub.description")];
  if (event.voteUnitPriceCfa && event.voteUnitPriceCfa > 0) {
    parts.push(translateVars(locale, "meta.price", { price: formatCfa(event.voteUnitPriceCfa, locale) }));
  }
  const end = formatEventDate(event.endsAt, locale);
  if (end) parts.push(translateVars(locale, "meta.endsOn", { date: end }));
  return parts.join(" ");
}

export function openGraphLocale(locale: Locale): string {
  return locale === "en" ? "en_GB" : "fr_FR";
}
