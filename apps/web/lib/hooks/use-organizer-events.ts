"use client";

import { useQuery } from "@tanstack/react-query";

import { authedFetch } from "../api";
import { getStoredToken } from "../auth";
import { getPaymentSetupStatus } from "../organizer-secrets";
import { getEventPartnerStatus } from "../partners";

export type OrganizerEventItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
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

/**
 * L'organisateur peut-il encaisser des votes ? Vrai si le setup PSP est prêt
 * OU si le dernier événement est un événement partenaire (paiement géré).
 */
export function usePaymentReadiness(latestEventId: string | undefined) {
  const setup = useQuery({
    queryKey: ["organizer", "payment-setup"],
    queryFn: async (): Promise<{ readyForVotes: boolean }> => {
      const token = getStoredToken();
      if (!token) return { readyForVotes: false };
      return getPaymentSetupStatus(token);
    },
  });

  const partner = useQuery({
    queryKey: ["organizer", "partner-status", latestEventId],
    enabled: Boolean(latestEventId) && Boolean(getStoredToken()),
    queryFn: async (): Promise<{ isPartnerEvent: boolean }> => {
      const token = getStoredToken();
      if (!token || !latestEventId) return { isPartnerEvent: false };
      return getEventPartnerStatus(token, latestEventId);
    },
  });

  const skipPaymentStep = partner.data?.isPartnerEvent ?? false;
  const ready = skipPaymentStep || (setup.data?.readyForVotes ?? false);
  return { ready, skipPaymentStep };
}
