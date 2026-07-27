import { apiFetch } from "./api";

export type SearchEvent = { id: string; title: string; slug: string; status: string };
export type SearchCandidate = { id: string; fullName: string; number: number; eventId: string; eventTitle: string };
export type SearchMember = { id: string; email: string; role: string };
export type SearchPayment = { id: string; providerRef: string | null; status: string; amountCfa: number; createdAt: string; eventId: string };
export type SearchResults = {
  query: string;
  events: SearchEvent[];
  candidates: SearchCandidate[];
  members: SearchMember[];
  payments: SearchPayment[];
};

export function search(token: string, q: string, limit: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<SearchResults>(`/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    ...(signal ? { signal } : {})
  });
}

export type SearchKind = "event" | "candidate" | "member" | "payment";

export function searchResultHref(kind: SearchKind, item: { id: string; eventId?: string }): string {
  switch (kind) {
    case "event":
      return `/dashboard/events/${item.id}/candidates`;
    case "candidate":
      return `/dashboard/events/${item.eventId}/candidates`;
    case "member":
      return "/dashboard/team";
    case "payment":
      return `/dashboard/events/${item.eventId ?? item.id}/edit`;
  }
}
