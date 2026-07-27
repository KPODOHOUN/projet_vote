# Cron serverless de maintenance

Ce guide branche une purge quotidienne sans serveur permanent.

## Endpoint cible
- URL: `POST /api/v1/maintenance/cron/purge`
- Header requis: `x-maintenance-cron-signature`
- Secret utilisé: `API_MAINTENANCE_CRON_SECRET`

## Exemple Cloudflare Worker (Cron Trigger)

```ts
export interface Env {
  API_BASE_URL: string;
  API_MAINTENANCE_CRON_SECRET: string;
  TENANT_SLUG: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    const body = {
      tenantSlug: env.TENANT_SLUG,
      auditLogsRetentionDays: 365,
      idempotencyRetentionDays: 30,
      revokedSessionsRetentionDays: 30,
      runAtIso: new Date().toISOString()
    };

    const raw = stableStringify(body);
    const signature = await sign(env.API_MAINTENANCE_CRON_SECRET, raw);

    await fetch(`${env.API_BASE_URL}/api/v1/maintenance/cron/purge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-maintenance-cron-signature": signature
      },
      body: JSON.stringify(body)
    });
  }
};
```

## Notes
- Réutiliser exactement le même `body` sur retry pour bénéficier de l'idempotence.
- L'API retourne `alreadyExecuted: true` si le job du jour a déjà été traité.
- `runAtIso` doit rester dans la fenêtre autorisée (`API_MAINTENANCE_CRON_MAX_SKEW_SECONDS`, défaut 15 minutes).
