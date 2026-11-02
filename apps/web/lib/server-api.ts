import { cookies, headers } from "next/headers";
import { getApiBaseUrl } from "./api-base-url";
import { PREVIEW_COOKIE, edgeProxyHeaders, isPreviewTokenShaped, visitorIp } from "./edge-proxy";

/**
 * Lecture serveur d'une donnée publique d'un concours (pages /e/{slug}/*).
 * - transmet l'IP du visiteur à l'API (limites de débit par visiteur) ;
 * - joint le jeton d'aperçu d'un brouillon : celui de l'URL (`?preview=`), sinon
 *   celui du cookie posé par le middleware sur /e/{slug} — l'aperçu reste donc
 *   complet en naviguant (candidats, résultats, billetterie).
 * Renvoie null si l'API répond par une erreur (concours introuvable, brouillon).
 */
export async function fetchPublicApi<T>(path: string, previewFromUrl?: string | undefined): Promise<T | null> {
  try {
    const [preview, headerStore] = await Promise.all([currentPreviewToken(previewFromUrl), headers()]);
    const separator = path.includes("?") ? "&" : "?";
    const query = isPreviewTokenShaped(preview) ? `${separator}preview=${encodeURIComponent(preview)}` : "";
    const response = await fetch(`${getApiBaseUrl()}${path}${query}`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...edgeProxyHeaders(visitorIp(headerStore)) }
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Jeton d'aperçu de la page : celui de l'URL, sinon celui du cookie de /e/{slug}. */
export async function currentPreviewToken(previewFromUrl?: string | undefined): Promise<string | undefined> {
  if (isPreviewTokenShaped(previewFromUrl)) return previewFromUrl;
  const fromCookie = (await cookies()).get(PREVIEW_COOKIE)?.value;
  return isPreviewTokenShaped(fromCookie) ? fromCookie : undefined;
}

/** Valeur brute de `?preview=` d'une page. */
export function previewParam(searchParams: { preview?: string | string[] | undefined }): string | undefined {
  return typeof searchParams.preview === "string" ? searchParams.preview : undefined;
}
