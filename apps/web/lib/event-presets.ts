// lib/event-presets.ts — Modèles prêts à l'emploi par type d'événement :
// un clic dans l'éditeur règle le style de page, la police et la couleur.
// L'organisateur garde la main sur chaque réglage ensuite.

import type { EventFontStyleValue, EventPageStyleValue } from "./brand";

export type EventPreset = {
  id: string;
  fr: string;
  en: string;
  pageStyle: EventPageStyleValue;
  fontStyle: EventFontStyleValue;
  brandColor: string;
};

export const EVENT_PRESETS: EventPreset[] = [
  { id: "miss", fr: "Miss et beauté", en: "Pageant", pageStyle: "COURONNE", fontStyle: "GALA", brandColor: "#DB2777" },
  { id: "mode", fr: "Mode et défilé", en: "Fashion show", pageStyle: "MAGAZINE", fontStyle: "CLASSIQUE", brandColor: "#111827" },
  { id: "concert", fr: "Concert et musique", en: "Concert and music", pageStyle: "LINEUP", fontStyle: "FESTIVAL", brandColor: "#7C3AED" },
  { id: "talents", fr: "Chant et talents", en: "Talent show", pageStyle: "SOIREE", fontStyle: "GALA", brandColor: "#D4A017" },
  { id: "sport", fr: "Sport et tournoi", en: "Sport and tournament", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#DC2626" },
  { id: "esport", fr: "E-sport et jeux vidéo", en: "Esports and gaming", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#8B5CF6" },
  { id: "agro", fr: "Agronomie et foire agricole", en: "Agriculture fair", pageStyle: "TERROIR", fontStyle: "CLASSIQUE", brandColor: "#15803D" },
  { id: "gastronomie", fr: "Gastronomie et cuisine", en: "Food and cooking", pageStyle: "TERROIR", fontStyle: "GALA", brandColor: "#C2410C" },
  { id: "ecole", fr: "École et université", en: "School and university", pageStyle: "DIPLOME", fontStyle: "GALA", brandColor: "#1E3A8A" },
  { id: "awards", fr: "Prix et awards", en: "Awards", pageStyle: "DIPLOME", fontStyle: "CLASSIQUE", brandColor: "#B45309" },
  { id: "culture", fr: "Culture et arts", en: "Arts and culture", pageStyle: "AFFICHE", fontStyle: "FESTIVAL", brandColor: "#EA580C" },
  { id: "gospel", fr: "Gospel et chorale", en: "Gospel and choir", pageStyle: "COURONNE", fontStyle: "GALA", brandColor: "#6D28D9" },
  { id: "danse", fr: "Danse", en: "Dance", pageStyle: "POP", fontStyle: "FESTIVAL", brandColor: "#E11D48" },
  { id: "humour", fr: "Humour et stand-up", en: "Comedy", pageStyle: "POP", fontStyle: "FESTIVAL", brandColor: "#FACC15" },
  { id: "cinema", fr: "Cinéma et court-métrage", en: "Film", pageStyle: "SOIREE", fontStyle: "CLASSIQUE", brandColor: "#DC2626" },
  { id: "entreprise", fr: "Entrepreneuriat et pitch", en: "Startup pitch", pageStyle: "BILLET", fontStyle: "CLASSIQUE", brandColor: "#2563EB" }
];
