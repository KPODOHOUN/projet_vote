import type { AuthMode } from "@/components/auth/auth-dialog";

/** Query param pour ouvrir le modal auth sur n'importe quelle page. */
export const AUTH_QUERY_PARAM = "auth";
export const AUTH_NEXT_PARAM = "next";

export function parseAuthMode(value: string | null): AuthMode | null {
  if (value === "login" || value === "register") return value;
  return null;
}

/** URL d'accueil avec modal connexion ou inscription (deep-link / redirection). */
export function authModalUrl(mode: AuthMode, next?: string | null): string {
  const params = new URLSearchParams({ [AUTH_QUERY_PARAM]: mode });
  if (isSafeInternalPath(next)) {
    params.set(AUTH_NEXT_PARAM, next);
  }
  return `/?${params.toString()}`;
}

export function authLoginUrl(next?: string | null): string {
  return authModalUrl("login", next);
}

export function authRegisterUrl(next?: string | null): string {
  return authModalUrl("register", next);
}

/**
 * Chemin interne au site. `/\evil.com` ou `/\t/evil.com` commencent par un
 * seul « / » mais le navigateur les lit comme `//evil.com` : on refuse barres
 * obliques inverses et caractères de contrôle, puis on vérifie l'origine résolue.
 */
export function isSafeInternalPath(next: string | null | undefined): next is string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return false;
  try {
    const base = "https://interne.invalid";
    return new URL(next, base).origin === base;
  } catch {
    return false;
  }
}

/** Retour post-connexion sûr (chemin interne uniquement). */
export function sanitizeAuthReturnTo(next: string | null | undefined): string | null {
  if (!isSafeInternalPath(next)) return null;
  if (next.startsWith("/login") || next.startsWith("/register")) return null;
  return next;
}
