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
export function usePublicTicketTypes(slug: string) {
  return useQuery({
    queryKey: ["public-ticket-types", slug],
    queryFn: () => apiFetch<PublicTicketType[]>(`/public/events/${slug}/ticket-types`),
    retry: 1,
    staleTime: 30_000
  });
}
