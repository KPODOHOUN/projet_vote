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

// Purge les anciens jetons persistés par les versions précédentes. Ils ne sont
// jamais relus : la restauration passe exclusivement par le cookie httpOnly.
if (typeof window !== "undefined") {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem("vp.organizer.refresh-token");
}

// ── Token en mémoire ──────────────────────────────────────────────────────
let accessToken: string | null = null;

// ── Coordination multi-onglets ────────────────────────────────────────────
// Navigateur seulement : côté serveur (rendu, tests) un canal garderait le processus en vie.
const broadcast = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel(BROADCAST_CHANNEL)
  : null;

if (broadcast) {
  broadcast.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data?.type) return;
    if (data.type === "token") {
      accessToken = data.token ?? null;
      scheduleRenewal(accessToken);
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

// ── Renouvellement anticipé ───────────────────────────────────────────────
// Le jeton d'accès vit 15 min : il est renouvelé une minute avant d'expirer,
// tant que la page reste ouverte (tableau de bord, éditeur, scanner à l'entrée).
let renewTimer: ReturnType<typeof setTimeout> | null = null;

/** Date d'expiration (ms) lue dans le jeton, sans le vérifier (le serveur le fait). */
export function accessTokenExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function scheduleRenewal(token: string | null) {
  if (typeof window === "undefined") return;
  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = null;
  const expiry = token ? accessTokenExpiry(token) : null;
  if (!expiry) return;
  const delay = Math.max(5_000, expiry - Date.now() - 60_000);
  renewTimer = setTimeout(() => { void restoreSession(); }, delay);
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
    const data = (await res.json()) as { accessToken: string | null };
    if (!data.accessToken) {
      accessToken = null;
      return false;
    }
    accessToken = data.accessToken;
    broadcastToken(accessToken);
    scheduleRenewal(accessToken);
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
 * Stocke le token uniquement en mémoire et le diffuse aux autres onglets.
 */
export function setStoredToken(token: string) {
  accessToken = token;
  broadcastToken(token);
  scheduleRenewal(token);
}

/**
 * Efface le token en mémoire et dans localStorage, puis déconnecte
 * tous les autres onglets via BroadcastChannel.
 */
export function clearStoredToken() {
  accessToken = null;
  scheduleRenewal(null);
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

