// Keys of the global PlatformSetting key/value store (admin-configurable).
export const COMMISSION_BPS_KEY = "commission_bps";
export const ACTIVATION_FEE_CFA_KEY = "activation_fee_cfa";
export const FEEXPAY_SHOP_ID_KEY = "feexpay_shop_id";
export const MAINTENANCE_MODE_KEY = "maintenance_mode";
export const MAINTENANCE_MESSAGE_KEY = "maintenance_message";
export const PARTNER_DEFAULT_COMMISSION_BPS_KEY = "partner_default_commission_bps";
export const DEFAULT_PARTNER_COMMISSION_BPS = 2000; // 20%

export const OTP_TTL_SECONDS_KEY = "otp_ttl_seconds";
export const OTP_RESEND_DELAY_SECONDS_KEY = "otp_resend_delay_seconds";
export const DEFAULT_OTP_TTL_SECONDS = 600;
export const DEFAULT_OTP_RESEND_DELAY_SECONDS = 60;

export const OFFER1_ENABLED_KEY = "offer1_external_enabled";
export const OFFER2_ENABLED_KEY = "offer2_escrow_enabled";
export const OFFER1_COMMISSION_BPS_KEY = "offer1_commission_bps";
export const OFFER1_COMMISSION_FIXED_CFA_KEY = "offer1_commission_fixed_cfa";
export const OFFER2_RETENTION_BPS_KEY = "offer2_retention_bps";
export const OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY = "offer2_per_vote_commission_enabled";
export const OFFER2_PER_VOTE_COMMISSION_BPS_KEY = "offer2_per_vote_commission_bps";
export const SETTLEMENT_HELD_BPS_KEY = "settlement_held_bps";
export const DEFAULT_SETTLEMENT_HELD_BPS = 5_000; // 50% — constante plateforme unique tant que F5 (palier de confiance) n'est pas livré.
export const HELD_RELEASE_DELAY_HOURS_KEY = "held_release_delay_hours";
export const DEFAULT_HELD_RELEASE_DELAY_HOURS = 48;
export const PSP_FEEXPAY_SUPPORTS_SPLIT_KEY = "psp_feexpay_supports_split";
export const PSP_FEDAPAY_SUPPORTS_SPLIT_KEY = "psp_fedapay_supports_split";
export const PSP_KKIAPAY_SUPPORTS_SPLIT_KEY = "psp_kkiapay_supports_split";

export const DEFAULT_MAINTENANCE_MESSAGE_FR =
  "La plateforme est momentanément indisponible pour maintenance. Réessayez dans quelques minutes.";
export const DEFAULT_MAINTENANCE_MESSAGE_EN =
  "The platform is temporarily unavailable for maintenance. Please try again shortly.";

// Default applied when absent. Activation fee 0 => activation monetization is
// OFF (events activate freely). There is NO free quota: any fee > 0 must be
// paid for every event before it can be activated.
export const DEFAULT_ACTIVATION_FEE_CFA = 0;

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
