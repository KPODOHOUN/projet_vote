// Keys of the global PlatformSetting key/value store (admin-configurable).
export const COMMISSION_BPS_KEY = "commission_bps";
export const ACTIVATION_FEE_CFA_KEY = "activation_fee_cfa";
export const FEEXPAY_SHOP_ID_KEY = "feexpay_shop_id";
export const MAINTENANCE_MODE_KEY = "maintenance_mode";
export const MAINTENANCE_MESSAGE_KEY = "maintenance_message";
export const PARTNER_DEFAULT_COMMISSION_BPS_KEY = "partner_default_commission_bps";
export const DEFAULT_PARTNER_COMMISSION_BPS = 2000; // 20%

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
