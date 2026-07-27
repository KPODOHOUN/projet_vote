import type { UserRole } from "./auth-context";

export function isPlatformOperatorRole(role: UserRole | string | null | undefined): boolean {
  return role === "PLATFORM_ADMIN" || role === "PLATFORM_SUPER_ADMIN";
}

export function canManageTeam(role: UserRole | string | null | undefined): boolean {
  return role === "ORGANIZER_OWNER" || isPlatformOperatorRole(role);
}

/**
 * Gère les clés de paiement PSP (clés marchandes qui encaissent l'argent des
 * votes) : owner + opérateur plateforme uniquement. Le staff ne doit jamais
 * voir ni saisir ces clés (miroir UI du garde API owner-only).
 */
export function canManagePaymentSecrets(role: UserRole | string | null | undefined): boolean {
  return role === "ORGANIZER_OWNER" || isPlatformOperatorRole(role);
}
