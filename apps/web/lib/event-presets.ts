// lib/event-presets.ts — Modèles prêts à l'emploi par type d'événement :
// un clic dans l'éditeur règle le style de page, la police et la couleur.
// L'organisateur garde la main sur chaque réglage ensuite.

import type { EventFontStyleValue, EventPageStyleValue } from "./brand";

export type EventPresetCategoryId =
  | "beaute"
  | "scene"
  | "sport"
  | "terroir"
  | "savoir"
  | "pro"
  | "communaute"
  | "medias";

export type EventPresetCategory = { id: EventPresetCategoryId; fr: string; en: string };

export type EventPreset = {
  id: string;
  category: EventPresetCategoryId;
  fr: string;
  en: string;
  pageStyle: EventPageStyleValue;
  fontStyle: EventFontStyleValue;
  brandColor: string;
};

export const EVENT_PRESET_CATEGORIES: EventPresetCategory[] = [
  { id: "beaute", fr: "Beauté et mode", en: "Beauty and fashion" },
  { id: "scene", fr: "Musique et scène", en: "Music and stage" },
  { id: "sport", fr: "Sport et jeux", en: "Sport and games" },
  { id: "terroir", fr: "Agriculture, terroir et nature", en: "Farming, food and nature" },
  { id: "savoir", fr: "École et savoir", en: "School and knowledge" },
  { id: "pro", fr: "Entreprise et innovation", en: "Business and innovation" },
  { id: "communaute", fr: "Communauté, foi et traditions", en: "Community, faith and heritage" },
  { id: "medias", fr: "Médias et créateurs", en: "Media and creators" }
];

export const EVENT_PRESETS: EventPreset[] = [
  // Beauté et mode
  { id: "miss", category: "beaute", fr: "Miss et beauté", en: "Pageant", pageStyle: "COURONNE", fontStyle: "GALA", brandColor: "#DB2777" },
  { id: "mister", category: "beaute", fr: "Mister et élégance", en: "Mister pageant", pageStyle: "COURONNE", fontStyle: "CLASSIQUE", brandColor: "#1F2937" },
  { id: "mode", category: "beaute", fr: "Mode et défilé", en: "Fashion show", pageStyle: "MAGAZINE", fontStyle: "CLASSIQUE", brandColor: "#111827" },
  { id: "couture", category: "beaute", fr: "Couture et stylisme africain", en: "Tailoring and African fashion", pageStyle: "WAX", fontStyle: "FESTIVAL", brandColor: "#B45309" },
  { id: "coiffure", category: "beaute", fr: "Coiffure et tresses", en: "Hairstyling and braids", pageStyle: "MAGAZINE", fontStyle: "GALA", brandColor: "#9D174D" },
  { id: "maquillage", category: "beaute", fr: "Maquillage et esthétique", en: "Make-up artistry", pageStyle: "POP", fontStyle: "GALA", brandColor: "#BE185D" },
  { id: "bebe", category: "beaute", fr: "Plus beau bébé", en: "Cutest baby", pageStyle: "POP", fontStyle: "GALA", brandColor: "#F472B6" },
  { id: "reine-carnaval", category: "beaute", fr: "Reine du carnaval", en: "Carnival queen", pageStyle: "COURONNE", fontStyle: "FESTIVAL", brandColor: "#F59E0B" },

  // Musique et scène
  { id: "concert", category: "scene", fr: "Concert et musique", en: "Concert and music", pageStyle: "LINEUP", fontStyle: "FESTIVAL", brandColor: "#7C3AED" },
  { id: "talents", category: "scene", fr: "Chant et talents", en: "Talent show", pageStyle: "SOIREE", fontStyle: "GALA", brandColor: "#D4A017" },
  { id: "rap", category: "scene", fr: "Rap et hip-hop", en: "Rap and hip-hop", pageStyle: "LINEUP", fontStyle: "FESTIVAL", brandColor: "#EAB308" },
  { id: "afro", category: "scene", fr: "Afrobeats et coupé-décalé", en: "Afrobeats", pageStyle: "LINEUP", fontStyle: "FESTIVAL", brandColor: "#16A34A" },
  { id: "dj", category: "scene", fr: "DJ et électro", en: "DJ and electronic", pageStyle: "LINEUP", fontStyle: "FESTIVAL", brandColor: "#06B6D4" },
  { id: "orchestre", category: "scene", fr: "Instrumentistes et orchestres", en: "Musicians and orchestras", pageStyle: "SOIREE", fontStyle: "CLASSIQUE", brandColor: "#92400E" },
  { id: "danse", category: "scene", fr: "Danse", en: "Dance", pageStyle: "POP", fontStyle: "FESTIVAL", brandColor: "#E11D48" },
  { id: "danse-trad", category: "scene", fr: "Danses traditionnelles", en: "Traditional dance", pageStyle: "WAX", fontStyle: "FESTIVAL", brandColor: "#A16207" },
  { id: "humour", category: "scene", fr: "Humour et stand-up", en: "Comedy", pageStyle: "POP", fontStyle: "FESTIVAL", brandColor: "#FACC15" },
  { id: "theatre", category: "scene", fr: "Théâtre", en: "Theatre", pageStyle: "SOIREE", fontStyle: "GALA", brandColor: "#7F1D1D" },
  { id: "slam", category: "scene", fr: "Slam et poésie", en: "Slam and poetry", pageStyle: "AFFICHE", fontStyle: "CLASSIQUE", brandColor: "#78350F" },
  { id: "karaoke", category: "scene", fr: "Karaoké", en: "Karaoke", pageStyle: "POP", fontStyle: "FESTIVAL", brandColor: "#C026D3" },
  { id: "cirque", category: "scene", fr: "Magie et cirque", en: "Magic and circus", pageStyle: "AFFICHE", fontStyle: "FESTIVAL", brandColor: "#B91C1C" },

  // Sport et jeux
  { id: "sport", category: "sport", fr: "Sport et tournoi", en: "Sport and tournament", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#DC2626" },
  { id: "football", category: "sport", fr: "Football", en: "Football", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#15803D" },
  { id: "basket", category: "sport", fr: "Basketball", en: "Basketball", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#EA580C" },
  { id: "athletisme", category: "sport", fr: "Athlétisme et course", en: "Athletics and running", pageStyle: "STADE", fontStyle: "CLASSIQUE", brandColor: "#0369A1" },
  { id: "combat", category: "sport", fr: "Boxe et arts martiaux", en: "Boxing and martial arts", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#991B1B" },
  { id: "fitness", category: "sport", fr: "Fitness et culturisme", en: "Fitness and bodybuilding", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#0F172A" },
  { id: "supporters", category: "sport", fr: "Meilleur supporter", en: "Best supporter", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#CA8A04" },
  { id: "esport", category: "sport", fr: "E-sport et jeux vidéo", en: "Esports and gaming", pageStyle: "STADE", fontStyle: "FESTIVAL", brandColor: "#8B5CF6" },
  { id: "echecs", category: "sport", fr: "Échecs, dames et awalé", en: "Chess and board games", pageStyle: "DIPLOME", fontStyle: "CLASSIQUE", brandColor: "#1C1917" },
  { id: "quiz", category: "sport", fr: "Quiz et culture générale", en: "Quiz", pageStyle: "CAMPUS", fontStyle: "CLASSIQUE", brandColor: "#2563EB" },

  // Agriculture, terroir et nature
  { id: "agro", category: "terroir", fr: "Agronomie et foire agricole", en: "Agriculture fair", pageStyle: "TERROIR", fontStyle: "CLASSIQUE", brandColor: "#15803D" },
  { id: "agripreneurs", category: "terroir", fr: "Jeunes agripreneurs", en: "Young agripreneurs", pageStyle: "MARCHE", fontStyle: "CLASSIQUE", brandColor: "#65A30D" },
  { id: "elevage", category: "terroir", fr: "Élevage et concours d'animaux", en: "Livestock show", pageStyle: "MARCHE", fontStyle: "CLASSIQUE", brandColor: "#92400E" },
  { id: "cafe-cacao", category: "terroir", fr: "Café, cacao et produits locaux", en: "Coffee, cocoa and local produce", pageStyle: "MARCHE", fontStyle: "CLASSIQUE", brandColor: "#78350F" },
  { id: "peche", category: "terroir", fr: "Pêche et produits de la mer", en: "Fishing and seafood", pageStyle: "TERROIR", fontStyle: "FESTIVAL", brandColor: "#0E7490" },
  { id: "jardin", category: "terroir", fr: "Jardins, fleurs et horticulture", en: "Gardens and flowers", pageStyle: "TERROIR", fontStyle: "GALA", brandColor: "#BE123C" },
  { id: "gastronomie", category: "terroir", fr: "Gastronomie et cuisine", en: "Food and cooking", pageStyle: "MENU", fontStyle: "GALA", brandColor: "#C2410C" },
  { id: "restaurant", category: "terroir", fr: "Meilleur restaurant et maquis", en: "Best restaurant", pageStyle: "MENU", fontStyle: "FESTIVAL", brandColor: "#DC2626" },
  { id: "patisserie", category: "terroir", fr: "Pâtisserie", en: "Baking and pastry", pageStyle: "MENU", fontStyle: "GALA", brandColor: "#DB2777" },
  { id: "cocktails", category: "terroir", fr: "Cocktails et barmen", en: "Cocktails and bartenders", pageStyle: "MENU", fontStyle: "FESTIVAL", brandColor: "#0891B2" },
  { id: "ecologie", category: "terroir", fr: "Environnement et écologie", en: "Environment", pageStyle: "AFFICHE", fontStyle: "CLASSIQUE", brandColor: "#047857" },
  { id: "tourisme", category: "terroir", fr: "Tourisme et destinations", en: "Tourism and destinations", pageStyle: "MAGAZINE", fontStyle: "FESTIVAL", brandColor: "#0284C7" },

  // École et savoir
  { id: "ecole", category: "savoir", fr: "École et université", en: "School and university", pageStyle: "DIPLOME", fontStyle: "GALA", brandColor: "#1E3A8A" },
  { id: "campus", category: "savoir", fr: "Miss et Mister campus", en: "Campus pageant", pageStyle: "CAMPUS", fontStyle: "FESTIVAL", brandColor: "#9333EA" },
  { id: "laureats", category: "savoir", fr: "Majors et lauréats", en: "Top students", pageStyle: "DIPLOME", fontStyle: "FESTIVAL", brandColor: "#CA8A04" },
  { id: "eloquence", category: "savoir", fr: "Éloquence et débat", en: "Public speaking and debate", pageStyle: "DIPLOME", fontStyle: "GALA", brandColor: "#7C2D12" },
  { id: "dictee", category: "savoir", fr: "Dictée et orthographe", en: "Spelling bee", pageStyle: "CAMPUS", fontStyle: "CLASSIQUE", brandColor: "#1E40AF" },
  { id: "enseignant", category: "savoir", fr: "Meilleur enseignant", en: "Best teacher", pageStyle: "DIPLOME", fontStyle: "GALA", brandColor: "#0F766E" },
  { id: "science", category: "savoir", fr: "Sciences et robotique", en: "Science and robotics", pageStyle: "CAMPUS", fontStyle: "FESTIVAL", brandColor: "#0891B2" },
  { id: "hackathon", category: "savoir", fr: "Hackathon et code", en: "Hackathon", pageStyle: "BADGE", fontStyle: "CLASSIQUE", brandColor: "#22C55E" },
  { id: "litterature", category: "savoir", fr: "Littérature et écriture", en: "Writing and literature", pageStyle: "MAGAZINE", fontStyle: "CLASSIQUE", brandColor: "#57534E" },

  // Entreprise et innovation
  { id: "entreprise", category: "pro", fr: "Entrepreneuriat et pitch", en: "Startup pitch", pageStyle: "BADGE", fontStyle: "CLASSIQUE", brandColor: "#2563EB" },
  { id: "tech", category: "pro", fr: "Tech et startups", en: "Tech and startups", pageStyle: "BADGE", fontStyle: "FESTIVAL", brandColor: "#4F46E5" },
  { id: "femmes-entrepreneures", category: "pro", fr: "Femmes entrepreneures", en: "Women in business", pageStyle: "BILLET", fontStyle: "GALA", brandColor: "#BE185D" },
  { id: "produit", category: "pro", fr: "Meilleur produit et marque", en: "Best product and brand", pageStyle: "BILLET", fontStyle: "GALA", brandColor: "#EA580C" },
  { id: "employe", category: "pro", fr: "Employé du mois", en: "Employee of the month", pageStyle: "BADGE", fontStyle: "CLASSIQUE", brandColor: "#0369A1" },
  { id: "awards", category: "pro", fr: "Prix et awards", en: "Awards", pageStyle: "DIPLOME", fontStyle: "CLASSIQUE", brandColor: "#B45309" },
  { id: "finance", category: "pro", fr: "Finance et banque", en: "Finance and banking", pageStyle: "BADGE", fontStyle: "CLASSIQUE", brandColor: "#065F46" },
  { id: "salon", category: "pro", fr: "Salon et foire commerciale", en: "Trade fair", pageStyle: "BADGE", fontStyle: "CLASSIQUE", brandColor: "#1D4ED8" },
  { id: "election-bureau", category: "pro", fr: "Élection de délégués et bureau", en: "Delegate and board election", pageStyle: "BADGE", fontStyle: "CLASSIQUE", brandColor: "#334155" },

  // Communauté, foi et traditions
  { id: "culture", category: "communaute", fr: "Culture et arts", en: "Arts and culture", pageStyle: "AFFICHE", fontStyle: "FESTIVAL", brandColor: "#EA580C" },
  { id: "gospel", category: "communaute", fr: "Gospel et chorale", en: "Gospel and choir", pageStyle: "SANCTUAIRE", fontStyle: "GALA", brandColor: "#6D28D9" },
  { id: "paroisse", category: "communaute", fr: "Église et vie paroissiale", en: "Church and parish", pageStyle: "SANCTUAIRE", fontStyle: "CLASSIQUE", brandColor: "#1E3A8A" },
  { id: "recitation", category: "communaute", fr: "Récitation du Coran", en: "Quran recitation", pageStyle: "SANCTUAIRE", fontStyle: "GALA", brandColor: "#047857" },
  { id: "carnaval", category: "communaute", fr: "Carnaval et festival", en: "Carnival and festival", pageStyle: "WAX", fontStyle: "FESTIVAL", brandColor: "#F59E0B" },
  { id: "patrimoine", category: "communaute", fr: "Chefferie et patrimoine", en: "Traditional heritage", pageStyle: "WAX", fontStyle: "GALA", brandColor: "#7C2D12" },
  { id: "artisanat", category: "communaute", fr: "Artisanat et métiers d'art", en: "Crafts", pageStyle: "MARCHE", fontStyle: "FESTIVAL", brandColor: "#B45309" },
  { id: "jeunesse", category: "communaute", fr: "Jeunesse et quartier", en: "Youth and neighbourhood", pageStyle: "CAMPUS", fontStyle: "FESTIVAL", brandColor: "#F97316" },
  { id: "association", category: "communaute", fr: "Association et ONG", en: "Charity and NGO", pageStyle: "BILLET", fontStyle: "CLASSIQUE", brandColor: "#0D9488" },
  { id: "personnalite", category: "communaute", fr: "Personnalité de l'année", en: "Person of the year", pageStyle: "MAGAZINE", fontStyle: "GALA", brandColor: "#B91C1C" },

  // Médias et créateurs
  { id: "cinema", category: "medias", fr: "Cinéma et court-métrage", en: "Film", pageStyle: "SOIREE", fontStyle: "CLASSIQUE", brandColor: "#DC2626" },
  { id: "clips", category: "medias", fr: "Clips et vidéos", en: "Music videos", pageStyle: "STORY", fontStyle: "GALA", brandColor: "#E11D48" },
  { id: "influence", category: "medias", fr: "Influenceurs et créateurs", en: "Influencers and creators", pageStyle: "STORY", fontStyle: "FESTIVAL", brandColor: "#EC4899" },
  { id: "photo", category: "medias", fr: "Photographie", en: "Photography", pageStyle: "MAGAZINE", fontStyle: "CLASSIQUE", brandColor: "#27272A" },
  { id: "radio", category: "medias", fr: "Radio et animateurs", en: "Radio and hosts", pageStyle: "STORY", fontStyle: "FESTIVAL", brandColor: "#F59E0B" },
  { id: "artiste-annee", category: "medias", fr: "Artiste de l'année", en: "Artist of the year", pageStyle: "SOIREE", fontStyle: "GALA", brandColor: "#B45309" },
  { id: "design-graphique", category: "medias", fr: "Design graphique et illustration", en: "Graphic design and illustration", pageStyle: "AFFICHE", fontStyle: "GALA", brandColor: "#4338CA" }
];

/** Minuscules sans accents : « Élevage » se trouve en tapant « elevage ». */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Modèles à afficher : une recherche non vide porte sur tous les modèles
 * (noms FR et EN, nom de la famille) ; sinon, ceux de la famille choisie.
 */
export function filterPresets(category: EventPresetCategoryId, query: string): EventPreset[] {
  const needle = fold(query.trim());
  if (!needle) return EVENT_PRESETS.filter((p) => p.category === category);
  const categoryNames = new Map(EVENT_PRESET_CATEGORIES.map((c) => [c.id, `${c.fr} ${c.en}`]));
  return EVENT_PRESETS.filter((p) => fold(`${p.fr} ${p.en} ${categoryNames.get(p.category) ?? ""}`).includes(needle));
}
