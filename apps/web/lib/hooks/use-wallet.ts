"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../api";
import { getStoredToken } from "../auth";

export type WalletResponse = {
  id: string;
  tenantId: string;
  availableCfa: number;
  pendingCfa: number;
  updatedAt: string;
  recentEntries: Array<{
    id: string;
    kind: string;
    amountCfa: number;
    createdAt: string;
    note: string | null;
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
