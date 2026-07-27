import { getApiBaseUrl } from "./api-base-url";

const CONSENT_COOKIE = "vp_cookie_consent";
const SESSION_KEY = "vp.analytics.session";

export type AnalyticsEventName =
  | "register"
  | "login"
  | "event_created"
  | "quick_start_completed"
  | "candidate_added"
  | "event_activated"
  | "public_link_copied"
  | "candidate_link_copied"
  | "vote_cast"
  | "vote_succeeded";

function hasAnalyticsConsent(): boolean {
  if (typeof document === "undefined") return false;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { analytics?: boolean };
    return parsed.analytics === true;
  } catch {
    return false;
  }
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

export async function trackEvent(name: AnalyticsEventName, metadata?: Record<string, unknown>): Promise<void> {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  try {
    await fetch(`${getApiBaseUrl()}/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        sessionId: getSessionId(),
        metadata: metadata ?? {}
      })
    });
  } catch {
    // Analytics must never block UX.
  }
}
