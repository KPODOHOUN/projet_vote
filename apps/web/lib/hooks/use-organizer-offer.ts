"use client";

import { useQuery } from "@tanstack/react-query";

import { authedFetch } from "../api";
import { getStoredToken } from "../auth";

/** Conditions financières de l'organisateur (GET /organizer/offer). */
export type OrganizerOffer = {
  payoutConfigured: boolean;
  payoutNetwork: string | null;
  payoutPhoneLast4: string | null;
  /** Taux de commission en vigueur (points de base, 1 % = 100). */
  commissionBps: number;
  commissionSource: "tenant" | "default";
  upcomingCommission: { bps: number; effectiveFrom: string } | null;
  /** Commission sur chaque billet vendu (points de base). */
  ticketCommissionBps: number;
  heldBps: number;
  heldReleaseDelayHours: number;
};

export function useOrganizerOffer(enabled: boolean) {
  return useQuery({
    queryKey: ["organizer", "offer"],
    enabled: enabled && Boolean(getStoredToken()),
    staleTime: 30_000,
    queryFn: () => authedFetch<OrganizerOffer>("/organizer/offer"),
  });
}
