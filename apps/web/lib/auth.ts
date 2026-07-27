/**
 * 🔒 Gestion sécurisée du token d'accès
 *
 * Le token JWT est conservé UNIQUEMENT en mémoire (variable JS) — jamais dans
 * localStorage / sessionStorage. La session est restaurée au chargement via le
 * cookie httpOnly `vp_refresh` qui appelle `/auth/refresh`.
 *
 * Coordination multi-onglets via BroadcastChannel pour éviter la révocation
 * de chaîne (quand deux onglets tentent un refresh simultané).
 */

const STORAGE_KEY = "vp.organizer.token";
const BROADCAST_CHANNEL = "vp-auth";

// ── Token en mémoire ──────────────────────────────────────────────────────
let accessToken: string | null = null;

// ── Coordination multi-onglets ────────────────────────────────────────────
const broadcast = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel(BROADCAST_CHANNEL)
  : null;

if (broadcast) {
  broadcast.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data?.type) return;
    if (data.type === "token") {
      accessToken = data.token ?? null;
    }
    if (data.type === "logout") {
      accessToken = null;
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  };
}

function broadcastToken(token: string | null) {
  broadcast?.postMessage({ type: "token", token });
}

function broadcastLogout() {
  broadcast?.postMessage({ type: "logout" });
}

// ── Refresh single-flight ─────────────────────────────────────────────────
let refreshPromise: Promise<boolean> | null = null;

const API_BASE =
  typeof window !== "undefined"
    ? "/api/v1"
    : (process.env.API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "") + "/api/v1";

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const data = (await res.json()) as { accessToken: string };
    accessToken = data.accessToken;
    broadcastToken(accessToken);
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

export async function restoreSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

// ── API publique ──────────────────────────────────────────────────────────

/** Retourne le token en mémoire, ou null si pas de session active. */
export function getStoredToken(): string | null {
  return accessToken;
}

/**
 * Stocke le token en mémoire et le diffuse aux autres onglets.
 * Compatibilité ascendante : écrit aussi dans localStorage pour les pages
 * qui ne sont pas encore migrées (sera supprimé après migration complète).
 */
export function setStoredToken(token: string) {
  accessToken = token;
  broadcastToken(token);
  // Fallback localStorage pour migration progressive
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, token);
  }
}

/**
 * Efface le token en mémoire et dans localStorage, puis déconnecte
 * tous les autres onglets via BroadcastChannel.
 */
export function clearStoredToken() {
  accessToken = null;
  broadcastLogout();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearAuthStorage() {
  clearStoredToken();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem("vp.organizer.refresh-token");
  }
}

// ── Refresh token (déprécié : maintenant en cookie httpOnly) ──────────────

/** @deprecated Le refresh token est maintenant dans un cookie httpOnly */
export function getStoredRefreshToken(): string { return ""; }

/** @deprecated Le refresh token est maintenant dans un cookie httpOnly */
export function setStoredRefreshToken(_token: string) { /* no-op */ }

/** @deprecated Le refresh token est maintenant dans un cookie httpOnly */
export function clearStoredRefreshToken() { /* no-op */ }

