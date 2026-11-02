"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../api";
import { getStoredToken } from "../auth";

export type WithdrawalStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export type WithdrawalRow = {
  id: string;
  amountCfa: number;
  status: WithdrawalStatus;
  createdAt: string;
  processedAt: string | null;
  rejectReason: string | null;
  /** Numéro figé à la demande : réseau + 4 derniers chiffres (le numéro complet se révèle à part). */
  payoutNetwork: string | null;
  payoutPhoneLast4: string | null;
  tenant: {
    id: string;
    slug: string;
    displayName: string;
  };
};

/** Numéro complet à créditer pour un retrait accepté (consultation journalisée côté API). */
export const revealWithdrawalDestination = (id: string) =>
  authedFetch<{ network: string; phone: string; amountCfa: number }>(`/admin/offers/withdrawals/${id}/destination`);

export function useAdminWithdrawalsQuery(statusFilter?: string, enabled = true) {
  const hasToken = Boolean(getStoredToken());
  const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
  return useQuery({
    queryKey: ["admin", "withdrawals", statusFilter ?? "all"],
    queryFn: () => authedFetch<WithdrawalRow[]>(`/admin/offers/withdrawals${qs}`),
    enabled: enabled && hasToken,
  });
}

export function useAdminWithdrawalActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason
    }: {
      id: string;
      action: "approve" | "reject" | "mark-paid";
      reason?: string;
    }) => {
      const body = reason ? JSON.stringify({ reason }) : undefined;
      return authedFetch(`/admin/offers/withdrawals/${id}/${action}`, {
        method: "POST",
        ...(body ? { body } : {})
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    }
  });
}
