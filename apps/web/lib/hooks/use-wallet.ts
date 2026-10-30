"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../api";
import { getStoredToken } from "../auth";

export type WalletResponse = {
  id: string;
  tenantId: string;
  withdrawableCfa: number;
  heldCfa: number;
  updatedAt: string;
  recentEntries: Array<{
    id: string;
    kind: string;
    amountCfa: number;
    createdAt: string;
    note: string | null;
  }>;
  /** Ajouts additifs de l'API (Lot E5) : absents d'une ancienne API. */
  commissionCfa?: number;
  byEvent?: Array<{
    eventId: string;
    title: string;
    grossCfa: number;
    commissionCfa: number;
    heldCfa: number;
    creditedAvailableCfa: number;
  }>;
};

export type Withdrawal = {
  id: string;
  amountCfa: number;
  status: string;
  createdAt: string;
  rejectReason: string | null;
};

export function useWalletQuery(enabled = true) {
  const hasToken = Boolean(getStoredToken());
  return useQuery({
    queryKey: ["organizer", "wallet"],
    queryFn: () => authedFetch<WalletResponse>("/organizer/wallet"),
    enabled: enabled && hasToken,
  });
}

export function useWithdrawalsQuery(enabled = true) {
  const hasToken = Boolean(getStoredToken());
  return useQuery({
    queryKey: ["organizer", "withdrawals"],
    queryFn: () => authedFetch<Withdrawal[]>("/organizer/withdrawals"),
    enabled: enabled && hasToken,
  });
}

/** `withdrawalsAvailableAt` : fin du délai de sécurité de 24 h après un changement de numéro (null s'il est écoulé). */
export type PayoutDestination = { network: string; last4: string; withdrawalsAvailableAt: string | null } | null;

export function usePayoutDestinationQuery(enabled = true) {
  const hasToken = Boolean(getStoredToken());
  return useQuery({
    queryKey: ["organizer", "payout-destination"],
    queryFn: () => authedFetch<PayoutDestination>("/organizer/payout-destination"),
    enabled: enabled && hasToken,
  });
}

export function usePayoutDestinationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { phone: string; network: string }) =>
      authedFetch<NonNullable<PayoutDestination>>("/organizer/payout-destination", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["organizer", "payout-destination"], saved);
    },
  });
}

export function useWithdrawalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amountCfa: number) =>
      authedFetch("/organizer/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amountCfa }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizer", "wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["organizer", "withdrawals"] });
    },
  });
}
