/**
 * Réseaux Mobile Money proposés dans l'interface. Une seule source pour le
 * formulaire de vote, le bloc « Comment voter » et le numéro de retrait, afin
 * que ces écrans ne divergent jamais.
 */
export const MOBILE_NETWORKS = [
  { value: "mtn", label: "MTN" },
  { value: "moov", label: "Moov" },
  { value: "orange", label: "Orange" },
] as const;

export type MobileNetwork = (typeof MOBILE_NETWORKS)[number]["value"];

export function mobileNetworkLabel(value: string): string {
  return MOBILE_NETWORKS.find((n) => n.value === value.toLowerCase())?.label ?? value;
}

/** Même règle que l'API (`payout-destination.service.ts`) : 8 à 15 chiffres, « + » optionnel. */
export function isValidMobileMoneyNumber(phone: string): boolean {
  return /^\+?\d{8,15}$/.test(phone.replace(/[\s.-]/g, ""));
}
