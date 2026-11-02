import { getApiBaseUrl } from "./api-base-url";
import { getStoredToken, restoreSession } from "./auth";

export { getApiBaseUrl };

/**
 * Rafraîchissement sur 401 : passe par le MÊME single-flight que la restauration
 * de session (lib/auth.ts). Deux mécanismes séparés envoyaient deux fois le même
 * cookie en parallèle au chargement d'une page.
 */
async function runRefresh(): Promise<string | null> {
  return (await restoreSession()) ? getStoredToken() : null;
}

/** Délai au-delà duquel une requête est abandonnée (évite un spinner infini). */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Erreur API typée. Conserve le `status` HTTP pour que l'UI puisse distinguer
 * 401 (mauvais identifiants) de 429/403 (verrouillage brute-force) et adapter
 * le message + le chemin de récupération. `isTimeout` signale un abandon réseau.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly isTimeout: boolean;
  readonly code?: string | undefined;

  constructor(message: string, status: number, isTimeout = false, code?: string | undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isTimeout = isTimeout;
    this.code = code;
  }
}

export interface ApiFetchOptions extends RequestInit {
  /** Timeout en ms (défaut 15 s). */
  timeoutMs?: number;
}

/**
 * apiFetch de base — sans gestion d'auth automatique.
 * Utilisé pour les endpoints publics (login, register, refresh, etc.).
 */
/** Routes d'authentification : jamais de rafraîchissement automatique sur 401. */
const NO_RETRY_PATHS = ["/auth/refresh", "/auth/login", "/auth/logout", "/auth/verify-otp"];

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  try {
    return await apiFetchOnce<T>(path, options);
  } catch (error) {
    // Jeton d'accès expiré sur une requête authentifiée : la session est
    // rafraîchie (cookie httpOnly) et la requête rejouée une fois, avec le
    // nouveau jeton. Toutes les pages en profitent, sans code à part.
    const authorization = new Headers(options.headers).get("Authorization");
    if (!(error instanceof ApiError) || error.status !== 401 || !authorization || NO_RETRY_PATHS.some((p) => path.startsWith(p))) {
      throw error;
    }
    const fresh = (await restoreSession()) ? getStoredToken() : null;
    if (!fresh) throw error;
    // Mêmes en-têtes, mêmes noms (un « content-type » en double casserait le JSON) ; seul le jeton change.
    const original: Record<string, string> =
      options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : { ...((options.headers as Record<string, string> | undefined) ?? {}) };
    for (const name of Object.keys(original)) {
      if (name.toLowerCase() === "authorization") delete original[name];
    }
    return apiFetchOnce<T>(path, { ...options, headers: { ...original, Authorization: `Bearer ${fresh}` } });
  }
}

async function apiFetchOnce<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...rest,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(rest.headers ?? {})
      }
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("La requête a expiré. Réessayez.", 0, true);
    }
    throw new ApiError("Connexion au serveur impossible.", 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text();
    let message = "Erreur API";
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.code === "string") code = parsed.code;
        if (typeof parsed.message === "string") {
          message = parsed.message;
        } else if (Array.isArray(parsed.message)) {
          message = parsed.message.join(", ");
        } else if (parsed.message && typeof parsed.message === "object" && typeof parsed.message.message === "string") {
          message = parsed.message.message;
          if (typeof parsed.message.code === "string") code = parsed.message.code;
        } else {
          message = text || "Erreur API";
        }
      } else {
        message = text || "Erreur API";
      }
    } catch {
      message = text || "Erreur API";
    }
    throw new ApiError(message, response.status, false, code);
  }

  return (await response.json()) as T;
}

/**
 * authedFetch — comme apiFetch mais attache automatiquement le Bearer token
 * et gère le refresh transparent sur 401 (single-flight + coordination multi-onglets).
 */
export async function authedFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    return await apiFetch<T>(path, { ...options, headers });
  } catch (err) {
    // Refresh transparent sur 401
    if (err instanceof ApiError && err.status === 401 && !path.startsWith("/auth/")) {
      const newToken = await runRefresh();
      if (!newToken) {
        // Refresh échoué → rediriger vers login
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
        throw err;
      }
      // Rejouer la requête avec le nouveau token
      const retryHeaders = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> ?? {}),
        Authorization: `Bearer ${newToken}`,
      };
      return await apiFetch<T>(path, { ...options, headers: retryHeaders });
    }
    throw err;
  }
}
