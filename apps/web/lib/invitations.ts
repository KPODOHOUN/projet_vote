import { apiFetch } from "./api";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export type InvitationRole = "ORGANIZER_OWNER" | "ORGANIZER_STAFF";

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type CreatedInvitation = {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function listInvitations(token: string) {
  return apiFetch<{ items: Invitation[] }>("/organizer/invitations", {
    headers: authHeaders(token)
  });
}

export function createInvitation(token: string, input: { email: string; role: InvitationRole }) {
  return apiFetch<CreatedInvitation>("/organizer/invitations", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function revokeInvitation(token: string, id: string) {
  return apiFetch<{ id: string; status: "REVOKED" }>(`/organizer/invitations/${id}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
}

// Publique : pas d'en-tête d'auth, le serveur pose le cookie refresh.
export function acceptInvitation(input: { token: string; password: string }) {
  return apiFetch<{ accessToken: string }>("/auth/accept-invitation", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

// Lien transmis « out-of-band » à l'invité·e (le backend n'envoie pas d'email).
export function buildAcceptUrl(rawToken: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/accept-invitation/${rawToken}`;
}
