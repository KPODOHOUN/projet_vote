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
  if (next && next.startsWith("/") && !next.startsWith("//")) {
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

/** Retour post-connexion sûr (chemin interne uniquement). */
export function sanitizeAuthReturnTo(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (next.startsWith("/login") || next.startsWith("/register")) return null;
  return next;
}
