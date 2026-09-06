"use client";

import { useQuery } from "@tanstack/react-query";

import { authedFetch } from "../api";
import { getStoredToken } from "../auth";

export type OrganizerOffer = {
  offerType: "EXTERNAL" | "ESCROW";
  provider: "FEDAPAY" | "FEEXPAY" | "KKIAPAY" | null;
  fedapaySubAccount: {
    reference: string | null;
    submittedAt: string | null;
    verifiedAt: string | null;
    ready: boolean;
  };
};

/** Offre paiement active du tenant (GET /organizer/offer). */
export function useOrganizerOffer(enabled: boolean) {
  return useQuery({
    queryKey: ["organizer", "offer"],
    enabled: enabled && Boolean(getStoredToken()),
    staleTime: 30_000,
    queryFn: () => authedFetch<OrganizerOffer>("/organizer/offer"),
  });
}
