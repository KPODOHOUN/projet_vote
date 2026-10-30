// Keys of the global PlatformSetting key/value store (admin-configurable).
export const FEEXPAY_SHOP_ID_KEY = "feexpay_shop_id";
export const MAINTENANCE_MODE_KEY = "maintenance_mode";
export const MAINTENANCE_MESSAGE_KEY = "maintenance_message";

export const OTP_TTL_SECONDS_KEY = "otp_ttl_seconds";
export const OTP_RESEND_DELAY_SECONDS_KEY = "otp_resend_delay_seconds";
export const DEFAULT_OTP_TTL_SECONDS = 600;
export const DEFAULT_OTP_RESEND_DELAY_SECONDS = 60;

// Règles d'argent — source unique (OfferSettingsService). Commission prélevée
// sur le montant brut de chaque paiement confirmé ; le net de l'organisateur
// est partagé entre réserve et disponible ; la réserve est libérée après la
// clôture du concours, au délai ci-dessous.
export const COMMISSION_DEFAULT_BPS_KEY = "commission_default_bps";
export const DEFAULT_COMMISSION_BPS = 1_200; // 12 %
export const SETTLEMENT_HELD_BPS_KEY = "settlement_held_bps";
export const DEFAULT_SETTLEMENT_HELD_BPS = 5_000; // 50 % du net en réserve
export const HELD_RELEASE_DELAY_HOURS_KEY = "held_release_delay_hours";
export const DEFAULT_HELD_RELEASE_DELAY_HOURS = 48;

export const DEFAULT_MAINTENANCE_MESSAGE_FR =
  "La plateforme est momentanément indisponible pour maintenance. Réessayez dans quelques minutes.";
export const DEFAULT_MAINTENANCE_MESSAGE_EN =
  "The platform is temporarily unavailable for maintenance. Please try again shortly.";

/** Parse a stored integer setting, falling back when missing/invalid. */
export function parseIntSetting(value: string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseBoolSetting(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
