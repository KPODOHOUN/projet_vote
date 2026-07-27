export type EventLayoutId = "GRID" | "LIST" | "SPOTLIGHT";

export const EVENT_LAYOUTS: ReadonlyArray<{
  id: EventLayoutId;
  fr: string;
  en: string;
  descFr: string;
  descEn: string;
}> = [
  {
    id: "GRID",
    fr: "Grille",
    en: "Grid",
    descFr: "Cartes photo, idéal pour beaucoup de candidats.",
    descEn: "Photo cards, great for many candidates."
  },
  {
    id: "LIST",
    fr: "Liste",
    en: "List",
    descFr: "Lignes compactes photo + nom + votes.",
    descEn: "Compact rows: photo, name and votes."
  },
  {
    id: "SPOTLIGHT",
    fr: "Vedette",
    en: "Spotlight",
    descFr: "Un candidat mis en avant, puis une grille.",
    descEn: "One featured candidate, then a grid."
  }
];
