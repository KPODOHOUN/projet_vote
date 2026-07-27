import { apiFetch } from "./api";

export type Account = {
  email: string;
  role: string;
  tenant: { displayName: string; slug: string };
  createdAt: string;
};

export type AccountSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function getAccount(token: string) {
  return apiFetch<Account>("/account", { headers: authHeaders(token) });
}

export function changePassword(token: string, input: { currentPassword: string; newPassword: string }) {
  return apiFetch<{ success: true }>("/account/password", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function changeEmail(token: string, input: { newEmail: string; currentPassword: string }) {
  return apiFetch<{ accessToken: string }>("/account/email", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function listSessions(token: string) {
  return apiFetch<{ items: AccountSession[] }>("/account/sessions", { headers: authHeaders(token) });
}

export function revokeOtherSessions(token: string) {
  return apiFetch<{ revoked: number }>("/account/sessions/revoke-others", {
    method: "POST",
    headers: authHeaders(token)
  });
}

export function revokeSession(token: string, id: string) {
  return apiFetch<{ id: string; revoked: true }>(`/account/sessions/${id}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
}

// Libellé appareil lisible depuis l'User-Agent (heuristique légère, pas de lib).
export function deviceLabel(userAgent: string | null, fallback: string): string {
  if (!userAgent) return fallback;
  const browser = /Edg/.test(userAgent) ? "Edge"
    : /Chrome/.test(userAgent) ? "Chrome"
    : /Firefox/.test(userAgent) ? "Firefox"
    : /Safari/.test(userAgent) ? "Safari"
    : null;
  const os = /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent) ? "iOS"
    : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser || os || fallback;
}
