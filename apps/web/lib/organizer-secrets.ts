import { apiFetch } from "./api";

export const FEEXPAY_API_SECRET_KEY = "feexpay_api_secret";

export type PaymentSetupStatus = {
  /** PSP résolu (FEEXPAY | FEDAPAY | KKIAPAY). Additif ; jamais montré au votant. */
  provider?: string;
  key: string | null;
  organizerConfigured: boolean;
  eventConfigured: boolean;
  platformFallback: boolean;
  readyForVotes: boolean;
  activationUsesPlatformAccount: boolean;
  platformReadyForActivation: boolean;
  effectiveSource: "event" | "organizer" | "platform" | "none";
};

export type SecretStatus = {
  key: string;
  configured: boolean;
  maskedValue: string | null;
};

export async function getPaymentSetupStatus(token: string, eventId?: string): Promise<PaymentSetupStatus> {
  const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
  return apiFetch<PaymentSetupStatus>(`/organizer/secrets/payment-setup/status${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getOrganizerSecretStatus(token: string, key: string): Promise<SecretStatus> {
  return apiFetch<SecretStatus>(`/organizer/secrets/${encodeURIComponent(key)}/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function saveOrganizerSecret(token: string, key: string, value: string): Promise<{ key: string; updatedAt: string }> {
  return apiFetch("/organizer/secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, value })
  });
}

export async function saveEventSecret(
  token: string,
  eventId: string,
  key: string,
  value: string
): Promise<{ eventId: string; key: string; updatedAt: string }> {
  return apiFetch(`/organizer/secrets/events/${eventId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, value })
  });
}
