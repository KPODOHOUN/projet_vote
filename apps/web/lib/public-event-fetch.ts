// lib/public-event-fetch.ts — Fetch SSR partagé de la zone publique /e/*.
// Contrat RÉEL de GET /votes/public/event/:slug → { organizer, event, candidates }.
// Consommateurs : hub (app/e/[slug]/page.tsx), billetterie (app/e/[slug]/tickets/page.tsx).
// Les pages results et profil candidat appellent des endpoints dédiés
// (…/results, …/candidate/:ref) et conservent leurs fetchs locaux.

import { getApiBaseUrl } from "@/lib/api-base-url";
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
};

export async function fetchPublicEvent(slug: string): Promise<PublicEventResponse | null> {
  try {
    // Données live (statut/candidats peuvent évoluer) → no-store.
    const response = await fetch(`${getApiBaseUrl()}/votes/public/event/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicEventResponse;
  } catch {
    return null;
  }
}
