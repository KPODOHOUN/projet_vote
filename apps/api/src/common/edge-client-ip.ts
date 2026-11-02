import { timingSafeEqual } from "crypto";
import { isIP } from "net";
import type { IncomingHttpHeaders } from "http";

/**
 * IP réelle du visiteur relayée par le front (réécriture /api/v1 et rendu
 * serveur). Le front la transmet avec un secret partagé ; sans secret valide,
 * l'en-tête est ignoré et l'IP reste celle déduite par Express (trust proxy) —
 * personne ne peut donc se choisir une IP en appelant l'API en direct.
 */
export const EDGE_SECRET_HEADER = "x-shadoma-edge-secret";
export const EDGE_CLIENT_IP_HEADER = "x-shadoma-client-ip";

let lastMismatchWarning = 0;
/**
 * Le front relaie une IP avec un secret différent : configuration incohérente
 * (EDGE_PROXY_SECRET ≠ API_EDGE_PROXY_SECRET), tous les visiteurs partageraient
 * l'IP du front. Signalé dans les journaux, au plus toutes les 10 minutes.
 */
function warnMismatchedSecret(): void {
  const now = Date.now();
  if (now - lastMismatchWarning < 10 * 60_000) return;
  lastMismatchWarning = now;
  console.error("[edge-proxy] IP relayée avec un secret invalide : vérifier EDGE_PROXY_SECRET (front) = API_EDGE_PROXY_SECRET (API).");
}

export function trustedEdgeClientIp(headers: IncomingHttpHeaders, secret: string | undefined): string | null {
  const given = headers[EDGE_SECRET_HEADER];
  const ip = headers[EDGE_CLIENT_IP_HEADER];
  if (!secret || typeof given !== "string" || typeof ip !== "string") return null;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    warnMismatchedSecret();
    return null;
  }
  const candidate = ip.trim();
  return isIP(candidate) ? candidate : null;
}
