/**
 * URL directe de l'API pour le rendu serveur (hors proxy Next). En prod, le
 * SSR/RSC ne passe pas par le rewrite same-origin `/api/v1` (pas de `window`) :
 * il appelle l'API à son origine absolue, dérivée de `API_BASE_URL` (l'origine
 * Render, ex. `https://shadoma-api.onrender.com`). Repli local pour le dev.
 */
function ssrDirectApiBaseUrl(): string {
  const origin = process.env.API_BASE_URL;
  if (origin && origin.trim() !== "") {
    return `${origin.replace(/\/+$/, "")}/api/v1`;
  }
  return "http://127.0.0.1:3001/api/v1";
}

/**
 * Résout l'URL de base de l'API selon le contexte d'exécution.
 * - Navigateur : `/api/v1` (proxy Next same-origin → rewrite vers l'API)
 * - SSR / RSC : appel direct à l'origine absolue de l'API (`API_BASE_URL`)
 * - `NEXT_PUBLIC_API_BASE_URL` (URL absolue) l'emporte s'il est défini
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configured && configured.trim() !== "") {
    if (configured.startsWith("/") && typeof window === "undefined") {
      return ssrDirectApiBaseUrl();
    }
    return configured;
  }

  if (typeof window !== "undefined") {
    return "/api/v1";
  }

  return ssrDirectApiBaseUrl();
}
