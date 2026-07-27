import { apiFetch } from "./api";

export type PlatformVote = {
  id: string;
  tenantId: string;
  eventId: string;
  candidateId: string;
  amountCfa: number;
  createdAt: string;
  cancelledAt: string | null;
  cancelledReason: string | null;
};

export type PlatformVotesResponse = {
  items: PlatformVote[];
  nextCursor: string | null;
};

export type ListVotesParams = {
  eventId?: string;
  includeCancelled?: boolean;
  limit?: number;
  cursor?: string;
};

export function listPlatformVotes(token: string, params: ListVotesParams = {}) {
  const search = new URLSearchParams();
  if (params.eventId?.trim()) search.set("eventId", params.eventId.trim());
  if (params.includeCancelled) search.set("includeCancelled", "true");
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  return apiFetch<PlatformVotesResponse>(`/admin/platform/votes${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function cancelPlatformVote(token: string, voteId: string, reason: string) {
  return apiFetch<{ voteId: string; cancelled: boolean; paymentVoided: boolean }>(
    `/admin/platform/votes/${voteId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: { Authorization: `Bearer ${token}` }
    }
  );
}

export function deletePlatformVote(token: string, voteId: string) {
  return apiFetch<{ voteId: string; deleted: boolean; paymentVoided: boolean }>(
    `/admin/platform/votes/${voteId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    }
  );
}
