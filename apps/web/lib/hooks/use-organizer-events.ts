"use client";

import { useQuery } from "@tanstack/react-query";

import { authedFetch } from "../api";

export type OrganizerEventItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  endsAt?: string;
  candidateCount: number;
};

/** Liste des événements du tenant courant (GET /events, Bearer auto via authedFetch). */
export function useOrganizerEvents(enabled: boolean) {
  return useQuery({
    queryKey: ["organizer", "events"],
    enabled,
    queryFn: () => authedFetch<OrganizerEventItem[]>("/events"),
  });
}
