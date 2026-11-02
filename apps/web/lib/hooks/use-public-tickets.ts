"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../api";

export type PublicTicketType = {
  id: string;
  name: string;
  description: string | null;
  priceCfa: number;
  quantity: number;
  maxPerPerson: number;
  _count: { tickets: number };
};

/** Types de billets publics d'un événement (GET /public/events/:slug/ticket-types). */
export function usePublicTicketTypes(slug: string, previewToken?: string | null, initialData?: PublicTicketType[]) {
  // Un brouillon n'est lisible qu'avec le jeton d'aperçu de son organisateur.
  const query = previewToken ? `?preview=${encodeURIComponent(previewToken)}` : "";
  return useQuery({
    queryKey: ["public-ticket-types", slug, previewToken ?? null],
    queryFn: () => apiFetch<PublicTicketType[]>(`/public/events/${slug}/ticket-types${query}`),
    retry: 1,
    staleTime: 30_000,
    // Liste rendue par le serveur : affichée dès le premier écran, rafraîchie ensuite.
    ...(initialData ? { initialData, initialDataUpdatedAt: Date.now() } : {})
  });
}
