/**
 * Numéro Mobile Money : chiffres uniquement. Utilisé à la saisie pour empêcher
 * lettres/espaces/symboles (y compris via copier-coller ou autofill), sur tous
 * les tunnels de paiement (vote + activation). Borné à 15 chiffres (E.164).
 */
export function sanitizePhoneInput(raw: string): string {
  return raw.replace(/\D+/g, "").slice(0, 15);
}
