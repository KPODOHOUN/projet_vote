import type { Locale } from "./i18n";

const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "fr-FR");

/** FCFA formaté partout pareil : XOF, 0 décimale, locale de la page. */
export function formatCfa(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

/** Nombre entier (compteurs de voix) dans la locale de la page. */
export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
}

/** Date d'un concours (« 10 novembre 2026 ») ; chaîne vide si la date est illisible. */
export function formatEventDate(value: string | Date, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" });
}
