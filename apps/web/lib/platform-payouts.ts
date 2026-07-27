import { apiFetch } from "./api";

export type PayoutStatus = "PENDING" | "IN_FLIGHT" | "SUCCEEDED" | "FAILED" | "UNCERTAIN";
export type PayoutKind = "ORGANIZER" | "PLATFORM";

export type Payout = {
  id: string;
  periodId: string;
  kind: PayoutKind;
  beneficiaryTenantId: string | null;
  amountCfa: number;
  currency: string;
  status: PayoutStatus;
  provider: string;
  providerRef: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PayoutPeriod = {
  id: string;
  label: string;
  from: string;
  to: string;
  status: "OPEN" | "PROCESSING" | "CLOSED";
  createdAt: string;
  updatedAt: string;
};

export function listPayouts(
  token: string,
  params: { status?: PayoutStatus; kind?: PayoutKind; limit?: number } = {}
) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.kind) search.set("kind", params.kind);
  if (params.limit != null) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiFetch<Payout[]>(`/admin/platform/payouts${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function openPayoutPeriod(token: string, payload: { label: string; from: string; to: string }) {
  return apiFetch<PayoutPeriod>("/admin/platform/payouts/periods", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function processPayoutPeriod(token: string, periodId: string) {
  return apiFetch<{ payouts: Array<{ id: string; kind: PayoutKind; amountCfa: number; status: PayoutStatus }> }>(
    `/admin/platform/payouts/periods/${periodId}/process`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }
  );
}

export function resolveUncertainPayout(
  token: string,
  payoutId: string,
  payload: { resolution: "SUCCEEDED" | "FAILED"; providerRef?: string; reason?: string }
) {
  return apiFetch<{ id: string; status: string }>(`/admin/platform/payouts/${payoutId}/resolve`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` }
  });
}

export const PAYOUT_STATUS_TONE: Record<PayoutStatus, "live" | "pending" | "success" | "error" | "warning"> = {
  PENDING: "pending",
  IN_FLIGHT: "live",
  SUCCEEDED: "success",
  FAILED: "error",
  UNCERTAIN: "warning"
};
