import { apiFetch } from "./api";

export type PlatformPaymentSetup = {
  feexpayConfigured: boolean;
  shopIdConfigured: boolean;
  apiKeySource: "database" | "env" | "none";
  shopIdSource: "database" | "env";
  key: string;
};

export type PlatformSettingsResponse = {
  feexpayShopId: string;
  paymentSetup: PlatformPaymentSetup;
};

export async function getPlatformSettings(token: string) {
  return apiFetch<PlatformSettingsResponse>("/admin/platform/settings", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function savePlatformFeexpayCredentials(
  token: string,
  payload: { apiKey: string; shopId?: string }
) {
  return apiFetch<PlatformPaymentSetup>("/admin/platform/secrets/feexpay", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function getPlatformPaymentSetup(token: string) {
  return apiFetch<PlatformPaymentSetup>("/admin/platform/payment-setup", {
    headers: { Authorization: `Bearer ${token}` }
  });
}
