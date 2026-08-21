"use client";

import { useQuery } from "@tanstack/react-query";

import { authedFetch } from "../api";
import { getStoredToken } from "../auth";

export type SubscriptionUsage = {
  hasSubscription: boolean;
  planId?: string;
  planName: string | null;
  planSlug?: string | null;
  commissionRate?: number;
  eventsUsed: number;
  eventsLimit: number | null;
  expiresAt?: string;
  daysRemaining?: number;
};

/** Usage de l'abonnement du tenant courant (GET /subscriptions/usage). */
export function useSubscriptionUsage(enabled: boolean) {
  return useQuery({
    queryKey: ["organizer", "subscription-usage"],
    enabled: enabled && Boolean(getStoredToken()),
    staleTime: 30_000,
    queryFn: () => authedFetch<SubscriptionUsage>("/subscriptions/usage"),
  });
}
