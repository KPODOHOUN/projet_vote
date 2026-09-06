interface Env {
  API_BASE_URL: string;
  API_MAINTENANCE_CRON_SECRET: string;
  TENANT_SLUG: string;
  AUDIT_LOGS_RETENTION_DAYS?: string;
  IDEMPOTENCY_RETENTION_DAYS?: string;
  REVOKED_SESSIONS_RETENTION_DAYS?: string;
  // Payment reconciliation (ADR-017 safety net) tuning — optional overrides.
  RECONCILE_PULL_AFTER_MINUTES?: string;
  RECONCILE_EXPIRE_AFTER_MINUTES?: string;
  RECONCILE_LIMIT?: string;
  CLOSE_EXPIRED_EVENTS_LIMIT?: string;
  RELEASE_HELD_LIMIT?: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseRetention(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/** Signs `payload` and POSTs it to `path`, throwing on a non-2xx response. */
async function signedPost(env: Env, path: string, payload: Record<string, unknown>): Promise<void> {
  const signature = await signPayload(env.API_MAINTENANCE_CRON_SECRET, stableStringify(payload));
  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-maintenance-cron-signature": signature
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} cron request failed with ${response.status}: ${body}`);
  }
}

// The daily retention purge (heavy, once a day) and the payment reconciliation
// sweep (light, every few minutes) share one worker but run on different crons.
// The daily trigger is the only one that also runs the purge; every trigger runs
// reconciliation. cron identifies which schedule fired.
const DAILY_PURGE_CRONS = new Set(["0 1 * * *", "0 2 * * *"]);

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const runAtIso = new Date().toISOString();

    // Payment reconciliation safety net (every tick): recover paid-but-un-poked
    // transactions (lost webhook) and expire orphan PENDING rows that can never
    // resolve.
    const reconcilePayload = {
      pullAfterMinutes: parseRetention(env.RECONCILE_PULL_AFTER_MINUTES, 3),
      expireAfterMinutes: parseRetention(env.RECONCILE_EXPIRE_AFTER_MINUTES, 60),
      limit: parseRetention(env.RECONCILE_LIMIT, 200),
      runAtIso
    };
    ctx.waitUntil(signedPost(env, "/api/v1/payments/cron/reconcile", reconcilePayload));

    // Event closure uses the exact same settlement service as the organizer's
    // manual action. The API claims each event atomically, so overlapping cron
    // ticks cannot apply retention twice.
    const closeExpiredPayload = {
      limit: parseRetention(env.CLOSE_EXPIRED_EVENTS_LIMIT, 100),
      runAtIso
    };
    ctx.waitUntil(
      signedPost(env, "/api/v1/offers/cron/close-expired", closeExpiredPayload)
    );

    // Escrow held → withdrawable release (every tick): frees the reserve of
    // events closed more than `held_release_delay_hours` ago (48h by default).
    // Unlike close-expired there is no per-event atomic claim here — the API
    // serialises overlapping runs behind a distributed job lock instead, so a
    // second tick (or a replayed signed request inside the skew window) no-ops.
    const releaseHeldPayload = {
      limit: parseRetention(env.RELEASE_HELD_LIMIT, 100),
      runAtIso
    };
    ctx.waitUntil(
      signedPost(env, "/api/v1/offers/cron/release-held", releaseHeldPayload)
    );

    // Retention purge only on the daily schedule.
    if (DAILY_PURGE_CRONS.has(event.cron)) {
      const purgePayload = {
        tenantSlug: env.TENANT_SLUG,
        auditLogsRetentionDays: parseRetention(env.AUDIT_LOGS_RETENTION_DAYS, 365),
        idempotencyRetentionDays: parseRetention(env.IDEMPOTENCY_RETENTION_DAYS, 30),
        revokedSessionsRetentionDays: parseRetention(env.REVOKED_SESSIONS_RETENTION_DAYS, 30),
        runAtIso
      };
      ctx.waitUntil(signedPost(env, "/api/v1/maintenance/cron/purge", purgePayload));
    }
  }
};
