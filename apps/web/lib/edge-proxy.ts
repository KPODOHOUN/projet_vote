/**
 * Relais du front vers l'API (réécriture /api/v1 et rendu serveur) : l'IP du
 * visiteur est transmise avec un secret partagé (EDGE_PROXY_SECRET), que l'API
 * vérifie avant de la croire. Sans ce relais, tous les visiteurs auraient l'IP
 * du front : limites de débit communes, IP fausse dans les preuves de signature.
 */
export const EDGE_SECRET_HEADER = "x-shadoma-edge-secret";
export const EDGE_CLIENT_IP_HEADER = "x-shadoma-client-ip";

/** Cookie du jeton d'aperçu d'un brouillon, limité au chemin /e/{slug}. */
export const PREVIEW_COOKIE = "vp_preview";
const PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export function isPreviewTokenShaped(token: string | null | undefined): token is string {
  return typeof token === "string" && PREVIEW_TOKEN_PATTERN.test(token);
}

/**
 * IP du visiteur. Sur Vercel, `x-real-ip` et `x-forwarded-for` sont réécrits
 * par la plateforme (un client ne peut pas les imposer).
 */
export function visitorIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

/**
 * L'IP lue dans les en-têtes n'est fiable que si l'hébergeur les réécrit (Vercel,
 * ou un autre hébergeur déclaré par EDGE_TRUST_FORWARDED_IP=true). Ailleurs, un
 * visiteur pourrait s'en choisir une : rien n'est relayé et l'API garde sa
 * propre déduction (trust proxy).
 */
export function forwardedIpIsTrusted(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === "1" || env.EDGE_TRUST_FORWARDED_IP === "true";
}

/** En-têtes à joindre à un appel vers l'API ; vides sans secret ou hors hébergeur de confiance. */
export function edgeProxyHeaders(
  ip: string | null,
  secret = process.env.EDGE_PROXY_SECRET,
  trusted = forwardedIpIsTrusted()
): Record<string, string> {
  if (!secret || !ip || !trusted) return {};
  return { [EDGE_SECRET_HEADER]: secret, [EDGE_CLIENT_IP_HEADER]: ip };
}
