// lib/public-event-fetch.ts — Fetch SSR partagé de la zone publique /e/*.
// Contrat RÉEL de GET /votes/public/event/:slug → { organizer, event, candidates }.
// Consommateurs : hub (app/e/[slug]/page.tsx), billetterie (app/e/[slug]/tickets/page.tsx).
// Les pages results et profil candidat appellent leurs endpoints dédiés
// (…/results, …/candidate/:ref) par le même fetchPublicApi (lib/server-api.ts).

import { fetchPublicApi } from "./server-api";
import type { EventBranding } from "@/lib/brand";

export type PublicCandidate = {
  id: string;
  fullName: string;
  number: number | null;
  publicRef: string;
  photoUrl: string | null;
  voteCount: number;
};

export type PublicEvent = {
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  voteUnitPriceCfa: number | null;
  layout?: "GRID" | "LIST" | "SPOTLIGHT" | null;
  branding: EventBranding;
};

export type PublicOrganizer = { displayName: string; slug: string };

export type PublicEventResponse = {
  organizer: PublicOrganizer;
  event: PublicEvent;
  candidates: PublicCandidate[];
  /** Réseaux que le prestataire de ce concours sait débiter. */
  paymentNetworks?: string[];
};

/** `previewToken` : un concours en brouillon n'est renvoyé qu'avec le jeton d'aperçu de son organisateur. */
export async function fetchPublicEvent(slug: string, previewToken?: string): Promise<PublicEventResponse | null> {
  // Données live (statut/candidats peuvent évoluer) → no-store.
  return fetchPublicApi<PublicEventResponse>(`/votes/public/event/${encodeURIComponent(slug)}`, previewToken);
}
