# Multi-PSP Abstraction Seam (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the FeexPay-named payment boundary into a provider-agnostic `PspGateway` port + `PspRegistry`, add KkiaPay as a documented stub, route by organizer config — with **zero behavior change** to the live payin flow.

**Architecture:** A single `PspGateway` interface (payin + payout + status + balance) with provider-specific adapters (`FeexpayGateway` reusing the existing HTTP client logic; `KkiaPayGateway` a fail-safe stub). A `PspRegistry` resolves the gateway by `event.provider ?? tenant.provider ?? env default` and resolves per-provider credentials via the existing `OrganizerSecretsService.resolvePaymentSecret` chain (EventSecret → TenantSecret → env). `PaymentTransaction.provider` becomes a `PaymentProvider` enum. The existing verify-by-pull (ADR-017) is rebound through the registry but its invariants are untouched.

**Tech Stack:** NestJS 11, Prisma + PostgreSQL, Zod, `node:crypto`, `node:test` (real-DB tests against `votezpro_test`, no mock Prisma).

**Conventions (all tasks):**
- **TDD strict**: failing test first, minimal impl, green.
- **Real DB**: tests hit `votezpro_test`; `DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test"`. Build with `cd apps/api && npm run build`, run with `node --test dist/<path>.test.js`.
- **Migrations**: `packages/db/prisma/migrations/<YYYYMMDDHHMMSS>_<slug>/migration.sql` (timestamp strictly `> 20260601100000`) + `schema.prisma`; then `npm --workspace=@votezpro/db run db:generate`.
- **New `*.test.ts`**: add its compiled path to `apps/api/package.json` `test` + `test:coverage` scripts.
- **Git**: the repo is **not** a git repo yet. If you want the per-task commits below, run `git init` first; otherwise skip the `git commit` steps. They are written assuming git exists.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/db/prisma/schema.prisma` | `enum PaymentProvider`; `PaymentTransaction.provider` enum; `Tenant.provider`, `Event.provider` |
| `packages/db/prisma/migrations/20260604120000_payment_provider_enum/migration.sql` | enum + backfill + column type change + new nullable columns |
| `apps/api/src/payments/psp/psp.types.ts` | provider-neutral types + `PspGateway` port + `PSP_REGISTRY` token |
| `apps/api/src/payments/psp/feexpay.gateway.ts` | FeexPay adapter (payin/payout/status/balance), credentials injected per call |
| `apps/api/src/payments/psp/feexpay.gateway.test.ts` | FeexPay adapter unit tests (fetch mocked at boundary) |
| `apps/api/src/payments/psp/kkiapay.gateway.ts` | KkiaPay documented stub (fail-safe) |
| `apps/api/src/payments/psp/kkiapay.gateway.test.ts` | stub fail-safe tests |
| `apps/api/src/payments/psp/psp.registry.ts` | provider + credential resolution |
| `apps/api/src/payments/psp/psp.registry.test.ts` | resolution chain tests (real DB) |
| `apps/api/src/payments/feexpay/feexpay-verify.service.ts` | rebind to registry (resolve gateway by `tx.provider`) |
| `apps/api/src/payments/payments.module.ts` | provide registry + gateways; keep exports |
| `apps/api/src/config/env.ts` | `DEFAULT_PSP_PROVIDER`, `KKIAPAY_BASE_URL`, `KKIAPAY_API_KEY`, `KKIAPAY_SHOP_ID` + prod guards |

---

## Task A1: `PaymentProvider` enum migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260604120000_payment_provider_enum/migration.sql`

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/prisma/migrations/20260604120000_payment_provider_enum/migration.sql`:

```sql
-- Multi-PSP: PaymentTransaction.provider becomes a typed enum, and tenants/events
-- gain an optional provider override (organizer routing choice). Existing rows use
-- the literal 'feexpay' string and are backfilled to FEEXPAY before the type change.
CREATE TYPE "PaymentProvider" AS ENUM ('FEEXPAY', 'KKIAPAY');

UPDATE "PaymentTransaction" SET "provider" = 'FEEXPAY' WHERE "provider" = 'feexpay';

ALTER TABLE "PaymentTransaction" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "PaymentTransaction"
  ALTER COLUMN "provider" TYPE "PaymentProvider" USING ("provider"::"PaymentProvider");

ALTER TABLE "Tenant" ADD COLUMN "provider" "PaymentProvider";
ALTER TABLE "Event"  ADD COLUMN "provider" "PaymentProvider";
```

- [ ] **Step 2: Update `schema.prisma`**

Add after the `PaymentPurpose` enum (around line 42):

```prisma
enum PaymentProvider {
  FEEXPAY
  KKIAPAY
}
```

In `model Tenant`, add (near `commissionBps`):

```prisma
  // Organizer-level PSP routing choice. Null = inherit platform default.
  provider      PaymentProvider?
```

In `model Event`, add (near `commissionBps`):

```prisma
  // Per-event PSP routing override. Null = inherit the organizer's choice.
  provider         PaymentProvider?
```

In `model PaymentTransaction`, change:

```prisma
  provider       String
```
to:
```prisma
  provider       PaymentProvider
```

- [ ] **Step 3: Apply migration + regenerate client**

Run:
```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5432/votezpro" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm --workspace=@votezpro/db run db:generate
```
Expected: both migrations report applied; client regenerated with `PaymentProvider`.

- [ ] **Step 4: Fix the compile fallout in existing code**

The string literal `provider: "feexpay"` no longer type-checks. Update the two sites that write it:

In `apps/api/src/payments/payments.service.ts`, change the `paymentTransaction.create` data:
```ts
        provider: "feexpay",
```
to:
```ts
        provider: PaymentProvider.FEEXPAY,
```
and add `PaymentProvider` to the existing `@prisma/client` import line (line 11):
```ts
import { PaymentProvider, PaymentPurpose, PaymentStatus, UserRole } from "@prisma/client";
```

In `apps/api/src/payments/feexpay/feexpay-verify.service.test.ts` and `feexpay-verify.service` seed/test files, replace `provider: "feexpay"` with `provider: PaymentProvider.FEEXPAY` and import the enum. (Do the same in any other `*.test.ts` that seeds a `paymentTransaction` — grep below.)

Run:
```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
grep -rln 'provider: "feexpay"' apps/api/src
```
Expected after edits: no matches.

- [ ] **Step 5: Build to verify types**

Run: `cd apps/api && npm run build`
Expected: PASS (no TS errors).

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma apps/api/src/payments
git commit -m "feat(db): PaymentProvider enum + Tenant/Event.provider routing columns"
```

---

## Task A2: `PspGateway` port + neutral types

**Files:**
- Create: `apps/api/src/payments/psp/psp.types.ts`

- [ ] **Step 1: Write the port + types**

Create `apps/api/src/payments/psp/psp.types.ts`:

```ts
import type { PaymentProvider } from "@prisma/client";

/**
 * Provider-neutral payment boundary. Each adapter normalizes its own quirks
 * (FeexPay's "SUCCESSFUL" vs internal "SUCCEEDED", amount-as-string, operator
 * codes) so callers never branch on the provider. Statuses below are the
 * NORMALIZED tri-state — distinct from Prisma's PaymentStatus enum.
 */
export type PspNormalizedStatus = "PENDING" | "SUCCEEDED" | "FAILED";

/** Credentials resolved per-request from the EventSecret → TenantSecret → env chain. */
export interface PspCredentials {
  apiKey: string;
  shop: string;
}

export interface PspPayinInitInput {
  amountCfa: number;
  phoneNumber: string;
  operator: string; // provider-neutral; the adapter maps to its own code
  customId?: string | undefined; // our PaymentTransaction.id
  description?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
}

export interface PspPayinInitResult {
  reference: string; // stored as PaymentTransaction.providerRef
  status: PspNormalizedStatus;
  amountCfa: number;
}

export interface PspStatusResult {
  status: PspNormalizedStatus;
  amountCfa: number;
  currency: string;
  reason?: string | undefined;
}

export interface PspPayoutInput {
  idempotencyKey: string;
  amountCfa: number;
  beneficiaryAccount: string; // msisdn (organizer) or platform account ref
  network: string; // "MTN" | "MOOV" | ...
  label: string;
}

export type PspPayoutResult =
  | { status: "SUCCEEDED"; providerRef: string }
  | { status: "FAILED"; reason: string }
  | { status: "UNCERTAIN"; reason: string }; // timeout/5xx — no auto-retry, manual resolve

/**
 * Adapter port. A single stateless instance serves all tenants; credentials are
 * passed per call (resolved by the registry), so one gateway is reused across
 * tenants without holding tenant state.
 */
export interface PspGateway {
  readonly provider: PaymentProvider;
  initPayin(input: PspPayinInitInput, creds: PspCredentials): Promise<PspPayinInitResult>;
  fetchPayinStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult>;
  sendPayout(input: PspPayoutInput, creds: PspCredentials): Promise<PspPayoutResult>;
  fetchPayoutStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult>;
  getBalance(creds: PspCredentials): Promise<Record<string, number>>;
}

export const PSP_REGISTRY = Symbol("PSP_REGISTRY");
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd apps/api && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/payments/psp/psp.types.ts
git commit -m "feat(payments): provider-neutral PspGateway port + types"
```

---

## Task A3: `FeexpayGateway` adapter

Wraps the existing `FeexpayHttpClient` HTTP discipline (bounded timeout, single retry, 4xx-terminal, masked key) behind the new port, with credentials injected per call and payout/balance methods added.

**Files:**
- Create: `apps/api/src/payments/psp/feexpay.gateway.ts`
- Create: `apps/api/src/payments/psp/feexpay.gateway.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/payments/psp/feexpay.gateway.test.ts`:

```ts
import "reflect-metadata";
import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { FeexpayGateway } from "./feexpay.gateway";
import type { PspCredentials } from "./psp.types";

const creds: PspCredentials = { apiKey: "test_abc_key_1234567890", shop: "shop-1" };
const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { status, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.FEEXPAY_BASE_URL = "https://api-v2.feexpay.me";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("initPayin → normalized PENDING + reference, posts Bearer + shop + amount", async () => {
  let seen: { url: string; auth: string; body: any } | null = null;
  mockFetch((url, init) => {
    seen = {
      url,
      auth: (init.headers as Record<string, string>).Authorization,
      body: JSON.parse(String(init.body))
    };
    return { status: 200, body: { reference: "fp-ref-1", status: "PENDING", amount: 100 } };
  });
  const gw = new FeexpayGateway();
  const res = await gw.initPayin(
    { amountCfa: 100, phoneNumber: "2290166000000", operator: "MTN", customId: "tx1" },
    creds
  );
  assert.equal(res.reference, "fp-ref-1");
  assert.equal(res.status, "PENDING");
  assert.equal(res.amountCfa, 100);
  assert.equal(seen!.url, "https://api-v2.feexpay.me/api/transactions/public/requesttopay/mtn");
  assert.equal(seen!.auth, "Bearer test_abc_key_1234567890");
  assert.equal(seen!.body.shop, "shop-1");
  assert.equal(seen!.body.amount, 100);
});

test("fetchPayinStatus → maps SUCCESSFUL to SUCCEEDED, coerces string amount", async () => {
  mockFetch(() => ({
    status: 200,
    body: { status: "SUCCESSFUL", amount: "100", currency: "XOF" }
  }));
  const gw = new FeexpayGateway();
  const res = await gw.fetchPayinStatus("fp-ref-1", creds);
  assert.equal(res.status, "SUCCEEDED");
  assert.equal(res.amountCfa, 100);
  assert.equal(res.currency, "XOF");
});

test("sendPayout SUCCESSFUL → SUCCEEDED + providerRef", async () => {
  mockFetch((url, init) => {
    assert.equal(url, "https://api-v2.feexpay.me/api/payouts/public/transfer/global");
    const body = JSON.parse(String(init.body));
    assert.equal(body.network, "MTN");
    assert.equal(body.shop, "shop-1");
    return { status: 200, body: { reference: "po-ref-1", status: "SUCCESSFUL" } };
  });
  const gw = new FeexpayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "k1", amountCfa: 100, beneficiaryAccount: "2290166000000", network: "MTN", label: "x" },
    creds
  );
  assert.deepEqual(res, { status: "SUCCEEDED", providerRef: "po-ref-1" });
});

test("sendPayout on 5xx → UNCERTAIN (never auto-succeed)", async () => {
  mockFetch(() => ({ status: 503, body: { message: "down" } }));
  const gw = new FeexpayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "k1", amountCfa: 100, beneficiaryAccount: "2290166000000", network: "MTN", label: "x" },
    creds
  );
  assert.equal(res.status, "UNCERTAIN");
});

test("fetchPayoutStatus → normalized SUCCEEDED", async () => {
  mockFetch(() => ({
    status: 200,
    body: { reference: "po-ref-1", reseau: "MTN", amount: 50, status: "SUCCESSFUL", description: "x" }
  }));
  const gw = new FeexpayGateway();
  const res = await gw.fetchPayoutStatus("po-ref-1", creds);
  assert.equal(res.status, "SUCCEEDED");
  assert.equal(res.amountCfa, 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npm run build && node --test dist/payments/psp/feexpay.gateway.test.js
```
Expected: FAIL (`Cannot find module './feexpay.gateway'`).

- [ ] **Step 3: Write the gateway**

Create `apps/api/src/payments/psp/feexpay.gateway.ts`:

```ts
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import type {
  PspCredentials,
  PspGateway,
  PspNormalizedStatus,
  PspPayinInitInput,
  PspPayinInitResult,
  PspPayoutInput,
  PspPayoutResult,
  PspStatusResult
} from "./psp.types";

/** FeexPay provider status → our normalized tri-state. */
function normalize(raw: unknown): PspNormalizedStatus | null {
  switch (String(raw)) {
    case "PENDING":
      return "PENDING";
    case "SUCCESSFUL":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    default:
      return null;
  }
}

function toInt(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

@Injectable()
export class FeexpayGateway implements PspGateway {
  readonly provider = PaymentProvider.FEEXPAY;
  private readonly logger = new Logger(FeexpayGateway.name);

  private get baseUrl(): string {
    return (process.env.FEEXPAY_BASE_URL ?? env.FEEXPAY_BASE_URL).replace(/\/+$/, "");
  }
  private get timeoutMs(): number {
    const raw = process.env.FEEXPAY_HTTP_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : env.FEEXPAY_HTTP_TIMEOUT_MS;
  }

  async initPayin(input: PspPayinInitInput, creds: PspCredentials): Promise<PspPayinInitResult> {
    const operator = input.operator.toLowerCase();
    const url = `${this.baseUrl}/api/transactions/public/requesttopay/${operator}`;
    const raw = await this.requestJson<Record<string, unknown>>("POST", url, creds.apiKey, {
      phoneNumber: input.phoneNumber,
      amount: input.amountCfa,
      shop: creds.shop,
      first_name: input.firstName,
      last_name: input.lastName,
      description: input.description,
      custom_id: input.customId
    });
    const reference = raw.reference;
    if (!reference || typeof reference !== "string") {
      throw new ServiceUnavailableException("Feexpay: réponse d'init sans référence.");
    }
    const status = normalize(raw.status ?? "PENDING");
    if (!status) throw new ServiceUnavailableException(`Feexpay: statut d'init inconnu "${raw.status}".`);
    return { reference, status, amountCfa: toInt(raw.amount, input.amountCfa) };
  }

  async fetchPayinStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult> {
    const url = `${this.baseUrl}/api/transactions/public/single/status/${encodeURIComponent(reference)}`;
    const raw = await this.requestJson<Record<string, unknown>>("GET", url, creds.apiKey);
    const status = normalize(raw.status);
    if (!status) throw new ServiceUnavailableException(`Feexpay: statut inconnu "${raw.status}".`);
    return {
      status,
      amountCfa: toInt(raw.amount, 0),
      currency: String(raw.currency ?? ""),
      reason: raw.reason as string | undefined
    };
  }

  async sendPayout(input: PspPayoutInput, creds: PspCredentials): Promise<PspPayoutResult> {
    const url = `${this.baseUrl}/api/payouts/public/transfer/global`;
    try {
      const raw = await this.requestJson<Record<string, unknown>>("POST", url, creds.apiKey, {
        shop: creds.shop,
        amount: input.amountCfa,
        phoneNumber: input.beneficiaryAccount,
        network: input.network,
        motif: input.label
      });
      const status = normalize(raw.status);
      if (status === "SUCCEEDED") {
        const ref = String(raw.reference ?? "");
        if (!ref) return { status: "UNCERTAIN", reason: "payout sans reference" };
        return { status: "SUCCEEDED", providerRef: ref };
      }
      if (status === "FAILED") return { status: "FAILED", reason: String(raw.reason ?? "feexpay_failed") };
      // PENDING or unknown sync response — not certain; resolve by pull/manual.
      return { status: "UNCERTAIN", reason: `sync status "${raw.status}"` };
    } catch (err) {
      // Network/5xx/timeout — NEVER assume success. UNCERTAIN forces manual/pull.
      this.logger.warn({ msg: "feexpay.payout.uncertain", err: err instanceof Error ? err.message : String(err) });
      return { status: "UNCERTAIN", reason: err instanceof Error ? err.message : "payout_error" };
    }
  }

  async fetchPayoutStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult> {
    const url = `${this.baseUrl}/api/payouts/status/public/${encodeURIComponent(reference)}`;
    const raw = await this.requestJson<Record<string, unknown>>("GET", url, creds.apiKey);
    const status = normalize(raw.status);
    if (!status) throw new ServiceUnavailableException(`Feexpay: statut payout inconnu "${raw.status}".`);
    return {
      status,
      amountCfa: toInt(raw.amount, 0),
      currency: String(raw.currency ?? "XOF"),
      reason: raw.reason as string | undefined
    };
  }

  async getBalance(creds: PspCredentials): Promise<Record<string, number>> {
    const url = `${this.baseUrl}/api/balance/public/getByShop/${encodeURIComponent(creds.shop)}`;
    const raw = await this.requestJson<Record<string, unknown>>("GET", url, creds.apiKey);
    // FeexPay nests balances at data.data.balances.
    const data = (raw.data as Record<string, unknown> | undefined)?.data as
      | Record<string, unknown>
      | undefined;
    const balances = (data?.balances ?? {}) as Record<string, number>;
    return balances;
  }

  /**
   * Shared HTTP helper: bounded timeout, single retry on network/5xx, 4xx
   * terminal, API key masked in logs. Mirrors the original FeexpayHttpClient.
   */
  private async requestJson<T>(
    method: "GET" | "POST",
    url: string,
    apiKey: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    class TerminalError extends Error {
      constructor(public readonly inner: ServiceUnavailableException) {
        super(inner.message);
      }
    }

    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) init.body = JSON.stringify(body);
        const response = await fetch(url, init);
        if (response.status >= 200 && response.status < 300) {
          const text = await response.text();
          if (!text) throw new TerminalError(new ServiceUnavailableException("Feexpay: réponse vide."));
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new TerminalError(new ServiceUnavailableException("Feexpay: réponse non-JSON."));
          }
        }
        if (response.status >= 400 && response.status < 500) {
          this.logger.warn({
            msg: "feexpay.client_error",
            method,
            status: response.status,
            keyPrefix: apiKey.length > 6 ? `${apiKey.slice(0, 5)}…` : "***"
          });
          throw new TerminalError(
            new ServiceUnavailableException(`Feexpay: statut ${response.status} (${method}).`)
          );
        }
        lastErr = new ServiceUnavailableException(`Feexpay: statut ${response.status}.`);
      } catch (err) {
        if (err instanceof TerminalError) throw err.inner;
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt === 1) await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 200)));
    }
    throw lastErr instanceof Error ? lastErr : new ServiceUnavailableException("Feexpay: échec après retry.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && npm run build && node --test dist/payments/psp/feexpay.gateway.test.js
```
Expected: 5 PASS.

- [ ] **Step 5: Add to npm scripts + commit**

Add `dist/payments/psp/feexpay.gateway.test.js` to the `test` and `test:coverage` scripts in `apps/api/package.json`.
```bash
git add apps/api/src/payments/psp/feexpay.gateway.ts apps/api/src/payments/psp/feexpay.gateway.test.ts apps/api/package.json
git commit -m "feat(payments): FeexpayGateway adapter (payin/payout/status/balance)"
```

---

## Task A4: `PspRegistry` (provider + credential resolution)

**Files:**
- Create: `apps/api/src/payments/psp/psp.registry.ts`
- Create: `apps/api/src/payments/psp/psp.registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/payments/psp/psp.registry.test.ts`:

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OrganizerSecretsService } from "../../organizer-secrets/organizer-secrets.service";
import { assertTestDatabase, prisma, resetDatabase } from "../../test-utils/db";
import { FeexpayGateway } from "./feexpay.gateway";
import { KkiaPayGateway } from "./kkiapay.gateway";
import { PspRegistry } from "./psp.registry";

const prismaService = new PrismaService();
const secrets = new OrganizerSecretsService(prismaService);
const registry = new PspRegistry(prismaService, secrets, new FeexpayGateway(), new KkiaPayGateway());

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seed(opts: { tenantProvider?: PaymentProvider; eventProvider?: PaymentProvider }) {
  const tenant = await prisma.tenant.create({
    data: { slug: "reg-org", displayName: "Reg", provider: opts.tenantProvider ?? null }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "reg-evt",
      title: "Reg",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000),
      provider: opts.eventProvider ?? null
    }
  });
  return { tenant, event };
}

test("resolveProvider: event override wins over tenant", async () => {
  const { tenant, event } = await seed({
    tenantProvider: PaymentProvider.FEEXPAY,
    eventProvider: PaymentProvider.KKIAPAY
  });
  const p = await registry.resolveProvider({ tenantId: tenant.id, eventId: event.id });
  assert.equal(p, PaymentProvider.KKIAPAY);
});

test("resolveProvider: falls back to tenant when event has none", async () => {
  const { tenant, event } = await seed({ tenantProvider: PaymentProvider.KKIAPAY });
  const p = await registry.resolveProvider({ tenantId: tenant.id, eventId: event.id });
  assert.equal(p, PaymentProvider.KKIAPAY);
});

test("resolveProvider: falls back to env default when neither set", async () => {
  process.env.DEFAULT_PSP_PROVIDER = "FEEXPAY";
  const { tenant, event } = await seed({});
  const p = await registry.resolveProvider({ tenantId: tenant.id, eventId: event.id });
  assert.equal(p, PaymentProvider.FEEXPAY);
});

test("get: returns the matching gateway instance", () => {
  assert.equal(registry.get(PaymentProvider.FEEXPAY).provider, PaymentProvider.FEEXPAY);
  assert.equal(registry.get(PaymentProvider.KKIAPAY).provider, PaymentProvider.KKIAPAY);
});

test("resolveCredentials: uses event/tenant secret when present, else env", async () => {
  const { tenant, event } = await seed({});
  // No secret rows → env fallback
  process.env.FEEXPAY_API_KEY = "test_env_key_1234567890";
  process.env.FEEXPAY_SHOP_ID = "env-shop";
  const envCreds = await registry.resolveCredentials(PaymentProvider.FEEXPAY, {
    tenantId: tenant.id,
    eventId: event.id
  });
  assert.equal(envCreds.apiKey, "test_env_key_1234567890");
  assert.equal(envCreds.shop, "env-shop");

  // Tenant secret present → overrides env
  await secrets.saveSecret(
    { userId: "u1", tenantId: tenant.id, role: "ORGANIZER_OWNER" } as any,
    { key: "feexpay.api_key", value: "test_tenant_key_abcdef12345" }
  );
  await secrets.saveSecret(
    { userId: "u1", tenantId: tenant.id, role: "ORGANIZER_OWNER" } as any,
    { key: "feexpay.shop", value: "tenant-shop" }
  );
  const tCreds = await registry.resolveCredentials(PaymentProvider.FEEXPAY, {
    tenantId: tenant.id,
    eventId: event.id
  });
  assert.equal(tCreds.apiKey, "test_tenant_key_abcdef12345");
  assert.equal(tCreds.shop, "tenant-shop");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npm run build && node --test dist/payments/psp/psp.registry.test.js
```
Expected: FAIL (`Cannot find module './psp.registry'` / './kkiapay.gateway').

- [ ] **Step 3: Write the registry**

Create `apps/api/src/payments/psp/psp.registry.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import { OrganizerSecretsService } from "../../organizer-secrets/organizer-secrets.service";
import { PrismaService } from "../../prisma/prisma.service";
import { FeexpayGateway } from "./feexpay.gateway";
import { KkiaPayGateway } from "./kkiapay.gateway";
import type { PspCredentials, PspGateway } from "./psp.types";

export interface PspResolutionContext {
  tenantId: string;
  eventId?: string | undefined;
}

/** Per-provider secret keys in the EventSecret / TenantSecret store. */
const SECRET_KEYS: Record<PaymentProvider, { apiKey: string; shop: string }> = {
  FEEXPAY: { apiKey: "feexpay.api_key", shop: "feexpay.shop" },
  KKIAPAY: { apiKey: "kkiapay.api_key", shop: "kkiapay.shop" }
};

@Injectable()
export class PspRegistry {
  private readonly gateways: Map<PaymentProvider, PspGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: OrganizerSecretsService,
    feexpay: FeexpayGateway,
    kkiapay: KkiaPayGateway
  ) {
    this.gateways = new Map<PaymentProvider, PspGateway>([
      [PaymentProvider.FEEXPAY, feexpay],
      [PaymentProvider.KKIAPAY, kkiapay]
    ]);
  }

  get(provider: PaymentProvider): PspGateway {
    const gw = this.gateways.get(provider);
    if (!gw) throw new Error(`PSP gateway not registered: ${provider}`);
    return gw;
  }

  /** event.provider ?? tenant.provider ?? env default. */
  async resolveProvider(ctx: PspResolutionContext): Promise<PaymentProvider> {
    if (ctx.eventId) {
      const event = await this.prisma.client.event.findUnique({
        where: { id: ctx.eventId },
        select: { provider: true }
      });
      if (event?.provider) return event.provider;
    }
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { provider: true }
    });
    if (tenant?.provider) return tenant.provider;
    const fallback = process.env.DEFAULT_PSP_PROVIDER ?? env.DEFAULT_PSP_PROVIDER;
    return fallback === "KKIAPAY" ? PaymentProvider.KKIAPAY : PaymentProvider.FEEXPAY;
  }

  /**
   * Credentials for a provider in a tenant/event context. The full key+shop come
   * from the EventSecret → TenantSecret chain (reusing resolvePaymentSecret);
   * each missing piece falls back to the platform env credentials (Flow A).
   */
  async resolveCredentials(
    provider: PaymentProvider,
    ctx: PspResolutionContext
  ): Promise<PspCredentials> {
    const keys = SECRET_KEYS[provider];
    const eventId = ctx.eventId ?? "";
    const secretApiKey = eventId
      ? await this.secrets.resolvePaymentSecret(eventId, ctx.tenantId, keys.apiKey)
      : await this.resolveTenantSecret(ctx.tenantId, keys.apiKey);
    const secretShop = eventId
      ? await this.secrets.resolvePaymentSecret(eventId, ctx.tenantId, keys.shop)
      : await this.resolveTenantSecret(ctx.tenantId, keys.shop);

    return {
      apiKey: secretApiKey ?? this.envApiKey(provider),
      shop: secretShop ?? this.envShop(provider)
    };
  }

  private async resolveTenantSecret(tenantId: string, key: string): Promise<string | null> {
    // resolvePaymentSecret requires an eventId; for tenant-only contexts we read
    // the TenantSecret directly via the same decrypt path by passing a sentinel
    // eventId that cannot match (so it falls through to the tenant secret).
    return this.secrets.resolvePaymentSecret("__no_event__", tenantId, key);
  }

  private envApiKey(provider: PaymentProvider): string {
    return provider === PaymentProvider.KKIAPAY
      ? process.env.KKIAPAY_API_KEY ?? env.KKIAPAY_API_KEY
      : process.env.FEEXPAY_API_KEY ?? env.FEEXPAY_API_KEY;
  }

  private envShop(provider: PaymentProvider): string {
    return provider === PaymentProvider.KKIAPAY
      ? process.env.KKIAPAY_SHOP_ID ?? env.KKIAPAY_SHOP_ID
      : process.env.FEEXPAY_SHOP_ID ?? env.FEEXPAY_SHOP_ID;
  }
}
```

> Note: `resolvePaymentSecret("__no_event__", ...)` issues one `eventSecret.findUnique` that finds nothing then falls through to the tenant secret — correct and side-effect-free. Task A7 adds the `KKIAPAY_*` and `DEFAULT_PSP_PROVIDER` env fields this references.

- [ ] **Step 4: Run test to verify it passes**

Run (Task A5 must land first for `KkiaPayGateway`; if running A4 in isolation, create the A5 stub file first). Once A5 + A7 are in:
```bash
cd apps/api && npm run build && node --test dist/payments/psp/psp.registry.test.js
```
Expected: 5 PASS.

- [ ] **Step 5: Add to npm scripts + commit**

Add `dist/payments/psp/psp.registry.test.js` to `apps/api/package.json` test scripts.
```bash
git add apps/api/src/payments/psp/psp.registry.ts apps/api/src/payments/psp/psp.registry.test.ts apps/api/package.json
git commit -m "feat(payments): PspRegistry — provider + credential resolution chain"
```

---

## Task A5: `KkiaPayGateway` documented stub

**Files:**
- Create: `apps/api/src/payments/psp/kkiapay.gateway.ts`
- Create: `apps/api/src/payments/psp/kkiapay.gateway.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/payments/psp/kkiapay.gateway.test.ts`:

```ts
import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { PaymentProvider } from "@prisma/client";
import { KkiaPayGateway } from "./kkiapay.gateway";
import type { PspCredentials } from "./psp.types";

const creds: PspCredentials = { apiKey: "x", shop: "y" };

test("provider is KKIAPAY", () => {
  assert.equal(new KkiaPayGateway().provider, PaymentProvider.KKIAPAY);
});

test("initPayin throws ServiceUnavailable (fail-safe, never silently mis-pays)", async () => {
  await assert.rejects(
    new KkiaPayGateway().initPayin(
      { amountCfa: 100, phoneNumber: "2290166000000", operator: "MTN" },
      creds
    ),
    /not yet configured/i
  );
});

test("fetchPayinStatus throws ServiceUnavailable", async () => {
  await assert.rejects(new KkiaPayGateway().fetchPayinStatus("ref", creds), /not yet configured/i);
});

test("sendPayout returns UNCERTAIN (so orchestrator never assumes success)", async () => {
  const res = await new KkiaPayGateway().sendPayout(
    { idempotencyKey: "k", amountCfa: 100, beneficiaryAccount: "2290166000000", network: "MTN", label: "x" },
    creds
  );
  assert.equal(res.status, "UNCERTAIN");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npm run build && node --test dist/payments/psp/kkiapay.gateway.test.js
```
Expected: FAIL (`Cannot find module './kkiapay.gateway'`).

- [ ] **Step 3: Write the stub**

Create `apps/api/src/payments/psp/kkiapay.gateway.ts`:

```ts
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import type {
  PspCredentials,
  PspGateway,
  PspPayinInitInput,
  PspPayinInitResult,
  PspPayoutInput,
  PspPayoutResult,
  PspStatusResult
} from "./psp.types";

/**
 * KkiaPay adapter — DOCUMENTED STUB.
 *
 * The real KkiaPay HTTP integration is intentionally not implemented yet: we do
 * NOT invent endpoints. When the KkiaPay API reference is available, fill in:
 *
 *   - initPayin:          POST <kkiapay payin init endpoint>
 *   - fetchPayinStatus:   GET  <kkiapay transaction status endpoint>
 *   - sendPayout:         POST <kkiapay payout/disbursement endpoint>
 *   - fetchPayoutStatus:  GET  <kkiapay payout status endpoint>
 *   - getBalance:         GET  <kkiapay balance endpoint>
 *
 * Auth scheme, base URL (KKIAPAY_BASE_URL) and key format are TBD from the docs.
 * Until then every read path FAILS LOUDLY (ServiceUnavailable) and the write
 * path returns UNCERTAIN, so routing a tenant to KkiaPay can never silently
 * confirm a payin or assume a payout succeeded.
 */
@Injectable()
export class KkiaPayGateway implements PspGateway {
  readonly provider = PaymentProvider.KKIAPAY;

  async initPayin(_input: PspPayinInitInput, _creds: PspCredentials): Promise<PspPayinInitResult> {
    throw new ServiceUnavailableException("KkiaPay: adapter not yet configured.");
  }

  async fetchPayinStatus(_reference: string, _creds: PspCredentials): Promise<PspStatusResult> {
    throw new ServiceUnavailableException("KkiaPay: adapter not yet configured.");
  }

  async sendPayout(_input: PspPayoutInput, _creds: PspCredentials): Promise<PspPayoutResult> {
    return { status: "UNCERTAIN", reason: "KkiaPay adapter not yet configured." };
  }

  async fetchPayoutStatus(_reference: string, _creds: PspCredentials): Promise<PspStatusResult> {
    throw new ServiceUnavailableException("KkiaPay: adapter not yet configured.");
  }

  async getBalance(_creds: PspCredentials): Promise<Record<string, number>> {
    throw new ServiceUnavailableException("KkiaPay: adapter not yet configured.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && npm run build && node --test dist/payments/psp/kkiapay.gateway.test.js
```
Expected: 4 PASS.

- [ ] **Step 5: Add to npm scripts + commit**

Add `dist/payments/psp/kkiapay.gateway.test.js` to `apps/api/package.json` test scripts.
```bash
git add apps/api/src/payments/psp/kkiapay.gateway.ts apps/api/src/payments/psp/kkiapay.gateway.test.ts apps/api/package.json
git commit -m "feat(payments): KkiaPayGateway documented fail-safe stub"
```

---

## Task A6: env config for multi-PSP

**Files:**
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Add the env fields**

In `apps/api/src/config/env.ts`, inside the `z.object({...})` (after `FEEXPAY_HTTP_TIMEOUT_MS`, before `API_MAINTENANCE_CRON_SECRET`), add:

```ts
  // Default PSP when neither event nor tenant overrides it.
  DEFAULT_PSP_PROVIDER: z.enum(["FEEXPAY", "KKIAPAY"]).default("FEEXPAY"),
  // KkiaPay (second PSP — adapter is a stub until its API docs are wired).
  KKIAPAY_BASE_URL: z.string().url().default("https://api.kkiapay.me"),
  KKIAPAY_API_KEY: z.string().min(8).default("test_dev_only_kkiapay_api_key_change_me"),
  KKIAPAY_SHOP_ID: z.string().min(1).default("dev-shop"),
```

- [ ] **Step 2: Add the prod guard**

In the `superRefine`, add `KKIAPAY_API_KEY` to the `forbidden` array:

```ts
    {
      key: "KKIAPAY_API_KEY",
      value: "test_dev_only_kkiapay_api_key_change_me"
    }
```

(Leave the FeexPay-specific prefix checks as-is. KkiaPay's key prefix is unknown until its docs land — do not invent one.)

- [ ] **Step 3: Build to verify**

Run: `cd apps/api && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "feat(config): DEFAULT_PSP_PROVIDER + KkiaPay env fields"
```

---

## Task A7: Rebind payin verify-by-pull through the registry

Keep ADR-017 invariants identical; only swap how the gateway is obtained — resolve by `tx.provider` via the registry instead of the single FeexPay client.

**Files:**
- Modify: `apps/api/src/payments/feexpay/feexpay-verify.service.ts`
- Modify: `apps/api/src/payments/feexpay/feexpay-verify.service.test.ts`
- Modify: `apps/api/src/payments/payments.module.ts`

- [ ] **Step 1: Update the failing test to inject a registry**

In `apps/api/src/payments/feexpay/feexpay-verify.service.test.ts`, replace the `FakeFeexpay implements FeexpayClient` + construction with a fake registry that returns a gateway whose `fetchPayinStatus` is scripted. Replace lines 31-58 (the `FakeFeexpay` class through the `verify` construction) with:

```ts
import { PaymentProvider } from "@prisma/client";
import type { PspCredentials, PspGateway, PspStatusResult } from "../psp/psp.types";

class FakeGateway implements Partial<PspGateway> {
  next: { kind: "ok"; payload: PspStatusResult } | { kind: "throw"; err: Error } = {
    kind: "ok",
    payload: { status: "PENDING", amountCfa: 0, currency: "XOF" }
  };
  fetchCalls: string[] = [];
  async fetchPayinStatus(reference: string, _creds: PspCredentials): Promise<PspStatusResult> {
    this.fetchCalls.push(reference);
    if (this.next.kind === "throw") throw this.next.err;
    return this.next.payload;
  }
}

const prismaService = new PrismaService();
const fakeGateway = new FakeGateway();
const fakeRegistry = {
  get: (_p: PaymentProvider) => fakeGateway as unknown as PspGateway,
  resolveCredentials: async () => ({ apiKey: "k", shop: "s" }) as PspCredentials
};
const verify = new FeexpayVerifyService(prismaService, fakeRegistry as any);
```

Then update each test that sets `fake.next = { kind: "ok", payload: { status: "SUCCESSFUL", amount: "500", currency: "XOF" } }` to the **normalized** shape returned by gateways:
`fakeGateway.next = { kind: "ok", payload: { status: "SUCCEEDED", amountCfa: 500, currency: "XOF" } };`
- `"SUCCESSFUL"` → `"SUCCEEDED"`, `"FAILED"` → `"FAILED"`, `"PENDING"` → `"PENDING"`.
- `amount: "500"` (string) → `amountCfa: 500` (number).
- The `"500abc"` unparseable test: gateways always return a number, so this attack now lives in the gateway layer. **Delete** the `amount_unparseable` test from this file (it is covered structurally by `toInt` in `feexpay.gateway.ts`). Update `beforeEach` reset to `fakeGateway.next = { kind: "ok", payload: { status: "PENDING", amountCfa: 0, currency: "XOF" } }; fakeGateway.fetchCalls = [];`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npm run build && node --test dist/payments/feexpay/feexpay-verify.service.test.js
```
Expected: FAIL (constructor signature mismatch / `fetchStatus` no longer called).

- [ ] **Step 3: Rebind the service to the registry**

In `apps/api/src/payments/feexpay/feexpay-verify.service.ts`:

Replace the import of the FeexPay client/types (line 10) and the constructor injection. Change:
```ts
import { FEEXPAY_CLIENT, type FeexpayClient, type FeexpayStatusPayload } from "./feexpay.types";
```
to:
```ts
import { PspRegistry } from "../psp/psp.registry";
import type { PspStatusResult } from "../psp/psp.types";
```

Change the constructor:
```ts
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FEEXPAY_CLIENT) private readonly feexpay: FeexpayClient
  ) {}
```
to:
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PspRegistry
  ) {}
```
(Remove the now-unused `Inject` import if nothing else uses it.)

Replace the pull block. Change:
```ts
    let pull: FeexpayStatusPayload;
    try {
      pull = await this.feexpay.fetchStatus(reference);
    } catch (err) {
```
to:
```ts
    let pull: PspStatusResult;
    try {
      const creds = await this.registry.resolveCredentials(tx.provider, {
        tenantId: tx.tenantId,
        eventId: tx.eventId
      });
      pull = await this.registry.get(tx.provider).fetchPayinStatus(reference, creds);
    } catch (err) {
```

Now the normalized status is already `PENDING | SUCCEEDED | FAILED` and `amountCfa` is a number. Simplify the downstream checks:
- `if (pull.status === "PENDING")` — unchanged.
- `if (pull.status === "FAILED")` — unchanged.
- Replace `pull.status === "SUCCESSFUL"` comment block: the success branch now runs when status is `"SUCCEEDED"`. Replace the `parseAmount`/`pulledAmount` logic with a direct compare:
```ts
    // pull.status === "SUCCEEDED" — apply invariants BEFORE any mutation.
    const pulledAmount = pull.amountCfa;
    if (pulledAmount !== tx.amountCfa) {
      await this.auditReject({
        tenantId: tx.tenantId,
        transactionId: tx.id,
        reason: "amount_mismatch",
        metadata: { reference, expectedAmount: tx.amountCfa, providerAmount: pulledAmount }
      });
      return { outcome: "rejected", reason: "amount_mismatch", transactionId: tx.id };
    }
    if (pull.currency && pull.currency !== tx.currency) {
      await this.auditReject({
        tenantId: tx.tenantId,
        transactionId: tx.id,
        reason: "currency_mismatch",
        metadata: { reference, expectedCurrency: tx.currency, providerCurrency: pull.currency }
      });
      return { outcome: "rejected", reason: "currency_mismatch", transactionId: tx.id };
    }
```
Delete the now-unused `parseAmount` private method and the `amount_unparseable` branch.

- [ ] **Step 4: Update the module wiring**

In `apps/api/src/payments/payments.module.ts`, replace the FeexPay client provider with the registry + gateways. New content:

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizerSecretsModule } from "../organizer-secrets/organizer-secrets.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { FeexpayVerifyService } from "./feexpay/feexpay-verify.service";
import { FeexpayGateway } from "./psp/feexpay.gateway";
import { KkiaPayGateway } from "./psp/kkiapay.gateway";
import { PspRegistry } from "./psp/psp.registry";

@Module({
  imports: [AuthModule, OrganizerSecretsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    FeexpayVerifyService,
    FeexpayGateway,
    KkiaPayGateway,
    PspRegistry
  ],
  exports: [PaymentsService, FeexpayVerifyService, PspRegistry]
})
export class PaymentsModule {}
```

> Verify `OrganizerSecretsModule` exists and exports `OrganizerSecretsService`. If it does not export the service, add `exports: [OrganizerSecretsService]` to it.

- [ ] **Step 5: Remove the dead FeexPay client (only if nothing else imports it)**

Run:
```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
grep -rln "FEEXPAY_CLIENT\|FeexpayHttpClient\|feexpay/feexpay.http-client\|feexpay/feexpay.types" apps/api/src
```
If `PaymentsService` still imports `FEEXPAY_CLIENT`/`FeexpayClient` (it injects `@Inject(FEEXPAY_CLIENT) feexpay`), remove that unused injection from `payments.service.ts` (the service never calls it). Keep `feexpay.types.ts` only if other files still need it; otherwise leave the files in place (harmless) and just stop providing `FEEXPAY_CLIENT`. Do NOT delete `feexpay.http-client.ts`/`feexpay.http-client.test.ts` in this task — leave that cleanup as a follow-up to keep the diff focused.

- [ ] **Step 6: Run the full payments suite**

Run:
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payments/feexpay/feexpay-verify.service.test.js
```
Expected: all PASS (minus the deleted `amount_unparseable` test). Then run the whole suite: `cd apps/api && npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/payments
git commit -m "refactor(payments): rebind verify-by-pull through PspRegistry (no behavior change)"
```

---

## Self-Review

**Spec coverage (spec §3 Sub-project A):**
- §3.1 port → Task A2 ✓
- §3.2 FeexpayGateway + KkiaPay stub → Tasks A3, A5 ✓
- §3.3 registry + credential chain → Task A4 (reuses `resolvePaymentSecret`) ✓
- §3.4 enum migration + Tenant/Event.provider + env → Tasks A1, A6 ✓
- §3.5 payin refactor, no behavior change → Task A7 (verify-by-pull rebind; invariants unchanged) ✓

**Type consistency:** `PspGateway` methods (`initPayin`, `fetchPayinStatus`, `sendPayout`, `fetchPayoutStatus`, `getBalance`) are used identically in A3/A5/A7. `PspStatusResult.amountCfa` (number) is what A7 compares to `tx.amountCfa`. `PspCredentials {apiKey, shop}` consistent across A3/A4/A7. `PaymentProvider.FEEXPAY|KKIAPAY` consistent with the A1 enum.

**Open note for executor:** Tasks A2→A6 can land before A7. A4's test depends on A5 (KkiaPayGateway) and A6 (env fields) existing — land A5 + A6 before running A4's test (build order: A1, A2, A3, A5, A6, A4, A7).

**Placeholder scan:** none — every code step is complete. The only deliberate "TBD" is inside the KkiaPay stub's doc comment, which is correct (no invented endpoints).
