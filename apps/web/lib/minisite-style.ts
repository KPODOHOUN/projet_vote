// lib/minisite-style.ts — Habillage des mini-plateformes (/e/*) choisi par
// l'organisateur : style de page et police des titres. Fonctions pures,
// partagées par les pages publiques et l'éditeur d'apparence.

export type PageStyleKey =
  | "affiche"
  | "soiree"
  | "billet"
  | "couronne"
  | "magazine"
  | "pop"
  | "terroir"
  | "stade"
  | "lineup"
  | "diplome";
export type FontStyleKey = "festival" | "gala" | "classique";

const PAGE_STYLES: Record<string, PageStyleKey> = {
  AFFICHE: "affiche",
  SOIREE: "soiree",
  BILLET: "billet",
  COURONNE: "couronne",
  MAGAZINE: "magazine",
  POP: "pop",
  TERROIR: "terroir",
  STADE: "stade",
  LINEUP: "lineup",
  DIPLOME: "diplome"
};

/**
 * Image de fond du bandeau : la couverture si l'organisateur en a importé une
 * et n'a pas choisi « couleur unie ». Null sinon.
 */
export function heroImageOf(branding: { coverUrl?: string | null; heroBackground?: string | null }): string | null {
  if (!branding.coverUrl || branding.heroBackground === "COLOR") return null;
  return branding.coverUrl;
}
const FONT_STYLES: Record<string, FontStyleKey> = { FESTIVAL: "festival", GALA: "gala", CLASSIQUE: "classique" };

/** Valeur API → clé CSS (`data-page-style`). Inconnue ou absente : affiche. */
export function pageStyleOf(value: string | null | undefined): PageStyleKey {
  return (value && PAGE_STYLES[value]) || "affiche";
}

/** Valeur API → clé CSS (`data-title-font`). Inconnue ou absente : festival. */
export function fontStyleOf(value: string | null | undefined): FontStyleKey {
  return (value && FONT_STYLES[value]) || "festival";
}

export type CountdownParts = { days: number; hours: number; minutes: number };

/**
 * Temps restant jusqu'à `target`, en jours / heures / minutes entiers.
 * Retourne null si l'échéance est passée (ou atteinte) ou si la date est invalide.
 */
export function countdownParts(target: string, now: number): CountdownParts | null {
  const end = Date.parse(target);
  if (Number.isNaN(end)) return null;
  const remaining = end - now;
  if (remaining <= 0) return null;
  const totalMinutes = Math.floor(remaining / 60_000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60
  };
}
