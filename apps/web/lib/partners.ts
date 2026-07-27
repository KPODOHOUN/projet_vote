import { apiFetch } from "./api";

export type PartnerRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type PartnerOfferTier = {
  id: string;
  label: string;
  minRevenueCfa: number;
  maxRevenueCfa: number | null;
  platformShareBps: number;
  platformSharePercent: number;
  sortOrder: number;
  active: boolean;
};

export type PartnerRequestItem = {
  id: string;
  tenantId: string;
  eventId: string;
  status: PartnerRequestStatus;
  reason: string | null;
  estimatedRevenueCfa: number | null;
  offerTier: { id: string; label: string; platformShareBps: number } | null;
  requestedByUserId: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  tenantName: string;
  tenantSlug: string;
  eventTitle: string;
  eventSlug: string;
};

export type EventPartnerStatus = {
  eventId: string;
  isPartnerEvent: boolean;
  activationPaidAt: string | null;
  partnerPlatformShareBps: number | null;
  partnerPlatformSharePercent: number | null;
  estimatedRevenueCfa: number | null;
  usesPlatformPaymentAccount: boolean;
  request: {
    id: string;
    status: PartnerRequestStatus;
    reason: string | null;
    estimatedRevenueCfa: number | null;
    createdAt: string;
    decidedAt: string | null;
    suggestedTier: { label: string; platformShareBps: number } | null;
  } | null;
  debt: {
    amountCfa: number;
    recoveredCfa: number;
    remainingCfa: number;
    status: "OUTSTANDING" | "SETTLED" | "WRITTEN_OFF";
  } | null;
};

export type PartnerEventFinancials = {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  tenantId: string;
  tenantName: string;
  isPartnerEvent: boolean;
  status: string;
  estimatedRevenueCfa: number | null;
  partnerPlatformShareBps: number | null;
  offerTierLabel: string | null;
  votesGrossCfa: number;
  platformCommissionCfa: number;
  platformSharePercent: number;
  activationDebtCfa: number;
  activationRecoveredCfa: number;
  activationRemainingCfa: number;
  organizerGrossCfa: number;
  organizerNetPayableCfa: number;
  voteCount: number;
};

export type ActivationDebtItem = {
  id: string;
  tenantId: string;
  eventId: string;
  amountCfa: number;
  recoveredCfa: number;
  remainingCfa: number;
  status: "OUTSTANDING" | "SETTLED" | "WRITTEN_OFF";
  createdAt: string;
  tenantName: string;
  eventTitle: string;
  isPartnerEvent: boolean;
};

export async function listOfferTiers(token: string) {
  return apiFetch<PartnerOfferTier[]>("/partners/offer-tiers", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function listAdminOfferTiers(token: string) {
  return apiFetch<PartnerOfferTier[]>("/partners/admin/offer-tiers", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createOfferTier(
  token: string,
  payload: {
    label: string;
    minRevenueCfa: number;
    maxRevenueCfa?: number | null;
    platformShareBps: number;
    sortOrder?: number;
    active?: boolean;
  }
) {
  return apiFetch<{ id: string; label: string }>("/partners/admin/offer-tiers", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateOfferTier(
  token: string,
  tierId: string,
  payload: Partial<{
    label: string;
    minRevenueCfa: number;
    maxRevenueCfa: number | null;
    platformShareBps: number;
    sortOrder: number;
    active: boolean;
  }>
) {
  return apiFetch<{ id: string; updated: boolean }>(`/partners/admin/offer-tiers/${tierId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteOfferTier(token: string, tierId: string) {
  return apiFetch<{ deleted: boolean }>(`/partners/admin/offer-tiers/${tierId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function requestPartnerOffer(
  token: string,
  eventId: string,
  reason: string,
  estimatedRevenueCfa: number,
  acceptedTerms: boolean
) {
  return apiFetch<{ id: string; eventId: string; status: PartnerRequestStatus; createdAt: string }>(
    "/partners/requests",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        eventId,
        reason,
        estimatedRevenueCfa,
        acceptedTerms
      })
    }
  );
}

export async function getEventPartnerStatus(token: string, eventId: string) {
  return apiFetch<EventPartnerStatus>(`/partners/events/${eventId}/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function pendingPartnerRequestCount(token: string) {
  return apiFetch<{ count: number }>("/partners/admin/requests/pending-count", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function listPartnerRequests(token: string, status?: PartnerRequestStatus) {
  const query = status ? `?status=${status}` : "";
  return apiFetch<PartnerRequestItem[]>(`/partners/admin/requests${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function approvePartnerRequest(
  token: string,
  requestId: string,
  payload?: {
    offerTierId?: string;
    platformShareBps?: number;
    estimatedRevenueCfa?: number;
  }
) {
  return apiFetch<{ approved: boolean; requestId: string; platformShareBps: number }>(
    `/partners/admin/requests/${requestId}/approve`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload ?? {})
    }
  );
}

export async function rejectPartnerRequest(token: string, requestId: string, reason?: string) {
  return apiFetch<{ rejected: boolean; requestId: string }>(
    `/partners/admin/requests/${requestId}/reject`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(reason ? { reason } : {})
    }
  );
}

export async function listPartnerEventsFinancials(token: string) {
  return apiFetch<PartnerEventFinancials[]>("/partners/admin/events/financials", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function listActivationDebts(token: string, tenantId?: string) {
  const query = tenantId ? `?tenantId=${tenantId}` : "";
  return apiFetch<ActivationDebtItem[]>(`/partners/admin/debts${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function formatRevenueRange(
  tier: Pick<PartnerOfferTier, "minRevenueCfa" | "maxRevenueCfa">,
  isEn: boolean
): string {
  const fmt = (n: number) => n.toLocaleString(isEn ? "en-GB" : "fr-FR");
  if (tier.maxRevenueCfa == null) {
    return isEn ? `≥ ${fmt(tier.minRevenueCfa)} FCFA` : `≥ ${fmt(tier.minRevenueCfa)} FCFA`;
  }
  return `${fmt(tier.minRevenueCfa)} – ${fmt(tier.maxRevenueCfa)} FCFA`;
}
