# Multi-PSP abstraction + Payouts (Phase 3 superset) — Design

> Date: 2026-06-04
> Status: **Approved (design)** — pending implementation plan (writing-plans).
> Supersedes the locked decision *"Provider: FeexPay uniquement"* in
> `2026-06-02-remuneration-overhaul.md` → now **multi-PSP (FeexPay + KkiaPay)**.
> Builds **on top of** the existing (unimplemented) Phase 3 payout blueprint
> `2026-06-02-remuneration-phase-3-payouts.md`, keeping its `PayoutPeriod` /
> `Payout` / `PayoutLine` / `PayoutJobLock` model and all 6 anti-double-spend
> layers. The only change to that blueprint is: the hardcoded `FeexpayPayoutClient`
> + `provider String @default("feexpay")` are replaced by a provider-agnostic
> gateway port + registry, and the payin side is generalized the same way.

---

## 1. Goal

Two capabilities, built as **two sequential sub-projects** (B depends on A):

- **A — PSP abstraction seam.** Generalize the FeexPay-named payment boundary
  into a provider-agnostic gateway. Add **KkiaPay** as a second provider
  (documented stub until its API docs are supplied — ZERO invented endpoints).
  Route each transaction to a provider based on the **organizer's choice**
  (event override → tenant default → platform default).
- **B — Payouts (Flow A).** Implement the existing Phase 3 payout blueprint
  (batch period/line model, 6 anti-double-spend layers) **through** the new
  abstraction. Money is collected on the platform master account and the
  organizer's **net** (gross − commission) is paid out to their Mobile Money;
  the platform retains its commission. Plus platform payouts and a god-mode
  manual-resolution path for UNCERTAIN payouts.

### Locked decisions (this session)

| Decision | Choice |
|---|---|
| 2nd PSP | **KkiaPay** (documented stub first; real adapter when docs supplied) |
| Routing | **By organizer config**: `event.provider ?? tenant.provider ?? env default` |
| Credentials | **Hybrid, but Phase-1 settlement = Flow A only**. Money belonging to the platform lands on the platform account; the organizer's share is paid out to them. BYO collection (EventSecret/TenantSecret) stays supported for payin, but BYO commission-recovery is **out of scope** for this phase. |
| Payout uses | Organizer settlement (net), platform balance, manual admin resolution. **No refunds** in this phase. |
| Payout model | **Existing Phase 3 superset**: `PayoutPeriod` / `Payout` / `PayoutLine` / `PayoutJobLock`, 6 anti-double-spend layers. |
| Currency | XOF (FCFA) only |

### Non-goals (this phase)

- KkiaPay live HTTP calls (stub returns a typed "not configured" until docs).
- BYO commission recovery / reverse-charge / debt (Phase 3 plan's partner work, Phase 4).
- Refund payouts.
- Changing payin behavior (the seam is a refactor; payin logic is unchanged).

---

## 2. Current state (verified)

- **Payin (FeexPay) — live & mature.** `PaymentTransaction` ledger,
  `provider` free-string column (always `"feexpay"`). Front JS SDK initiates the
  push → `attachProviderRef` → webhook `/payments/webhooks/feexpay` →
  **verify-by-pull (ADR-017)**: never trusts the webhook body, re-pulls status
  server-to-server before flipping `SUCCEEDED`. Commission computed at
  confirmation (`commissionCfa`, chain `event.commissionBps ?? tenant.commissionBps ??`
  platform default). DI port is `FEEXPAY_CLIENT` / `FeexpayClient`, impl
  `FeexpayHttpClient`.
- **Credential chain already scaffolded.** `EventSecret` (per-event, *"the
  event's own FeexPay account"*) → `TenantSecret` (per-tenant) → env. Both
  AES-256-GCM.
- **Phases 0-2 done** (PLATFORM_SUPER_ADMIN, Vault, Privacy).
- **Phase 3 payouts NOT implemented**: no `apps/api/src/payouts/`, no `Payout`
  models, no module. The blueprint exists only as a plan doc.

---

## 3. Sub-project A — PSP abstraction seam

### 3.1 The port

A single provider-neutral gateway interface covering payin + payout + status +
balance. Provider-specific quirks (FeexPay's `SUCCESSFUL` vs internal `SUCCEEDED`,
amount-as-string, operator codes) are normalized **inside** each adapter.

```ts
// apps/api/src/payments/psp/psp.types.ts
export type PspProvider = "FEEXPAY" | "KKIAPAY"; // mirrors PaymentProvider enum

export interface PspPayinInitInput {
  amountCfa: number;
  phoneNumber: string;
  operator: string;          // provider-neutral; adapter maps to its own codes
  shop: string;              // resolved credential (account/shop id)
  customId?: string;         // our PaymentTransaction.id
  description?: string;
  firstName?: string; lastName?: string;
}
export interface PspPayinInitResult {
  reference: string;                                  // stored as providerRef
  status: "PENDING" | "SUCCEEDED" | "FAILED";         // normalized
  amountCfa: number;
}
export interface PspStatusResult {
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  amountCfa: number;
  currency: string;
  reason?: string;
}
export interface PspPayoutInput {
  idempotencyKey: string;
  amountCfa: number;
  beneficiaryAccount: string;   // msisdn (organizer) or platform account ref
  network: string;              // "MTN" | "MOOV" | ...
  label: string;
}
export type PspPayoutResult =
  | { status: "SUCCEEDED"; providerRef: string }
  | { status: "FAILED"; reason: string }
  | { status: "UNCERTAIN"; reason: string }; // timeout/5xx → no-retry, manual resolve

export interface PspGateway {
  readonly provider: PspProvider;
  initPayin(input: PspPayinInitInput): Promise<PspPayinInitResult>;
  fetchPayinStatus(reference: string): Promise<PspStatusResult>;
  sendPayout(input: PspPayoutInput): Promise<PspPayoutResult>;
  fetchPayoutStatus(reference: string): Promise<PspStatusResult>;
  getBalance(shop: string): Promise<Record<string, number>>;
}
```

### 3.2 Adapters

- **`FeexpayGateway`** — wraps the existing `FeexpayHttpClient` logic (bounded
  timeout, single retry, 4xx-terminal, masked key). Adds `sendPayout`
  (`POST /api/payouts/public/transfer/global`), `fetchPayoutStatus`
  (`GET /api/payouts/status/public/{ref}`), `getBalance`
  (`GET /api/balance/public/getByShop/{idShop}`). Status normalization:
  FeexPay `SUCCESSFUL` → `SUCCEEDED`; amount string → int.
- **`KkiaPayGateway`** — **documented stub**. Every method throws a typed
  `ServiceUnavailableException("KkiaPay: adapter not yet configured")` *except*
  `sendPayout`, which returns `{ status: "UNCERTAIN", reason: "KkiaPay not wired" }`
  so the payout orchestrator's UNCERTAIN path is exercised. A header comment
  lists exactly which KkiaPay endpoints must be filled in. **No invented URLs.**

### 3.3 Registry & resolution

```ts
// apps/api/src/payments/psp/psp.registry.ts
@Injectable() class PspRegistry {
  // gateway selection
  async resolveProvider(ctx: { eventId?: string; tenantId: string }): Promise<PspProvider>;
  get(provider: PspProvider): PspGateway;
  // credential selection (EventSecret → TenantSecret → env), per provider
  async resolveCredentials(provider, ctx): Promise<{ apiKey: string; shop: string }>;
}
```

- **Provider resolution:** `event.provider ?? tenant.provider ?? env.DEFAULT_PSP_PROVIDER`.
- **Credential resolution:** reuse the existing `EventSecret → TenantSecret → env`
  chain, keyed per provider (e.g. `feexpay.api_key` / `feexpay.shop`,
  `kkiapay.api_key` / `kkiapay.shop`). Phase-1 Flow A settlement uses the
  **platform env credentials** for the master account; BYO keys remain usable for
  payin collection but do not change the payout/settlement path.
- Adapters become **per-request configured** (credentials passed in), so a single
  gateway instance can serve multiple tenants. The existing `FeexpayHttpClient`'s
  constructor-time env read is refactored to accept resolved credentials.

### 3.4 Enum migration

- New Prisma `enum PaymentProvider { FEEXPAY KKIAPAY }`.
- `PaymentTransaction.provider`: `String` → `PaymentProvider` (migration with
  backfill `UPDATE "PaymentTransaction" SET provider='FEEXPAY' WHERE provider='feexpay'`,
  then type change).
- New nullable `Tenant.provider PaymentProvider?` and `Event.provider PaymentProvider?`
  (organizer routing choice; null = inherit).
- `env.ts`: add `DEFAULT_PSP_PROVIDER` (default `FEEXPAY`), `KKIAPAY_API_KEY`,
  `KKIAPAY_BASE_URL`, with a key-prefix guard mirroring FeexPay's `fp_`/`test_`.

### 3.5 Payin refactor (no behavior change)

`PaymentsService` and `FeexpayVerifyService` call `registry.get(tx.provider)`
and use `gateway.fetchPayinStatus(...)` instead of the FeexPay-typed method. The
verify-by-pull invariants (amount, currency, terminal-state guard, atomic
`$transaction`) are **unchanged**. Existing payin tests must stay green; the
fake gateway is bound against the same port in tests (real-DB tests, no mock
Prisma — per the project rule).

---

## 4. Sub-project B — Payouts (Phase 3 superset, through the seam)

Adopt the existing Phase 3 blueprint verbatim **except** for the provider
boundary. Summary of what carries over and what changes:

### 4.1 Data model (from the Phase 3 plan, with the enum change)

- `PayoutPeriod` (label-unique billing window, OPEN/PROCESSING/CLOSED).
- `Payout` (per `(periodId, kind, beneficiaryTenantId)` unique; `idempotencyKey`
  unique; `providerRef` unique; statuses PENDING/IN_FLIGHT/SUCCEEDED/FAILED/UNCERTAIN).
  **Change:** `provider String @default("feexpay")` → `provider PaymentProvider`.
- `PayoutLine` (pins exactly one source row — `paymentTransactionId` /
  `vaultEntryId` — via unique index; guarantees one-revenue-one-payout).
- `PayoutJobLock` (distributed mutex, expiry-safe).
- `PayoutKind { ORGANIZER PLATFORM }`, `PayoutStatus`, `PayoutPeriodStatus` enums.
- Add all four tables to `test-utils/db.ts` `TABLES` (PayoutLine before Payout).

### 4.2 Services (from the Phase 3 plan)

- **`PayoutBalanceService`** — stateless. `computeOrganizerBalance` (net =
  Σ(amount − commission) over SUCCEEDED VOTE payments in window, **excluding
  already-pinned** payments), `computePlatformBalance` (commissions + activation
  fees + confiscated vault entries, all excluding pinned), `listTenantsWithBalance`.
- **`PayoutJobLockService`** — `acquire`/`release`, expiry overwrite.
- **`PayoutsService`** — orchestrator with the 6 anti-double-spend layers:
  1. `idempotencyKey` = `sha256(period:kind:beneficiary)` + unique
     `(periodId, kind, beneficiaryTenantId)`.
  2. IN_FLIGHT state set before the provider call.
  3. `PayoutLine` pinning **only** on certain SUCCEEDED.
  4. Reconciliation re-pull (`fetchPayoutStatus`) for stuck IN_FLIGHT/UNCERTAIN.
  5. `PayoutJobLock` distributed lock around `processPeriod`.
  6. Balance cap (`amountCfa <= 0` → skip; never pay out more than computed).
  - **UNCERTAIN is terminal-until-human**: no auto-retry, no pinning; resolved
    via the admin endpoint.

### 4.3 Provider boundary change (the only real delta vs the plan)

The plan's `FeexpayPayoutClient` is replaced by `registry.get(provider).sendPayout(...)`
and `fetchPayoutStatus(...)`. For an **ORGANIZER** payout, `provider` is resolved
from the tenant's choice and `beneficiaryAccount` is the organizer's payout
Mobile Money number + network. For a **PLATFORM** payout, `provider` is the
platform default and the beneficiary is the platform account.

### 4.4 Organizer payout destination

- `Tenant.payoutNetwork String?` (e.g. `"MTN"`, `"MOOV"`) and
  `Tenant.payoutPhoneEnc` (encrypted via the existing TenantSecret/AES-256-GCM
  mechanism, plus a `payoutPhoneLast4` for display). Raw number never persisted
  in plaintext, never logged — consistent with voter-phone hashing.
- Set by `ORGANIZER_OWNER` in tenant settings (new endpoint), validated
  (10-digit `01`-prefixed format per FeexPay payout rules, min amount 50).

### 4.5 Verify-by-pull for payouts (mirrors ADR-017)

The synchronous `sendPayout` response is **not trusted as final**. A payout is
only marked SUCCEEDED after a `fetchPayoutStatus` confirmation (either inline
when the provider returns a definitive SUCCEEDED+ref, or via the reconciliation
re-pull). UNCERTAIN (timeout/5xx) never flips to SUCCEEDED automatically.

### 4.6 Admin surface (god-mode)

`/admin/platform/payouts/*`, `PLATFORM_ADMIN` + `PLATFORM_SUPER_ADMIN` only,
throttled, every action audited:
- `POST periods` (open window), `POST periods/:id/process`, `GET periods/:id`,
  `GET ` (list payouts), `POST :id/resolve` (resolve UNCERTAIN as SUCCEEDED+ref
  or FAILED).

---

## 5. Data model changes (summary)

1. `enum PaymentProvider { FEEXPAY KKIAPAY }`.
2. `enum PayoutPeriodStatus`, `enum PayoutStatus`, `enum PayoutKind`.
3. `PaymentTransaction.provider`: String → `PaymentProvider` (+ backfill).
4. `Tenant.provider PaymentProvider?`, `Event.provider PaymentProvider?`.
5. `Tenant.payoutNetwork String?`, `Tenant.payoutPhoneEnc String?`,
   `Tenant.payoutPhoneLast4 String?`.
6. New `PayoutPeriod`, `Payout` (with `provider PaymentProvider`), `PayoutLine`,
   `PayoutJobLock` models.
7. `test-utils/db.ts` TABLES updated (PayoutLine, Payout, PayoutPeriod,
   PayoutJobLock).
8. Migration timestamp strictly `> 20260601100000`; run
   `npm --workspace=@votezpro/db run db:generate` after.

---

## 6. Security

- **Payouts = god-mode only** (`PLATFORM_ADMIN`/`PLATFORM_SUPER_ADMIN`),
  throttled, fully audited (`AuditLog`, cross-tenant → target tenantId).
- **No double-disbursement**: 6 anti-double-spend layers; revenue can be paid out
  at most once (3 Prisma unique constraints + `PayoutLine` unique source index).
- **Verify-by-pull for payouts**: never trust `sendPayout`'s sync response.
- **Beneficiary number**: encrypted at rest (AES-256-GCM) + last4 only; never
  logged raw. Consistent with the voter-phone hashing rule.
- **PSP API keys**: resolved server-side, masked in logs, key-prefix validated in
  `env.ts`. Keep `packages/db/.env` to `DATABASE_URL` only (known footgun).
- **Tenant isolation**: organizer payout config writes are scoped to the caller's
  tenant; payout orchestration is platform-admin and explicitly cross-tenant by
  design (matches the existing platform-control god-mode model).

---

## 7. Testing (TDD, real DB — no mock Prisma)

- All `*.service.test.ts` hit `votezpro_test` (real PostgreSQL). New tables added
  to `TABLES`. Each new `*.test.ts` added to `apps/api` `test` + `test:coverage`
  scripts.
- **Seam tests**: payin behavior unchanged — existing FeexPay payin/verify tests
  stay green after routing through `PspRegistry` (fake gateway bound to the port).
- **Registry tests**: provider resolution chain (event → tenant → default) and
  credential resolution chain (EventSecret → TenantSecret → env).
- **Payout tests** (port the Phase 3 plan's red tests): balance computation,
  job-lock acquire/expiry, `processPeriod` SUCCEEDED (organizer net + platform),
  line pinning prevents re-pay, CLOSED rejection, concurrent single-worker,
  UNCERTAIN no-pin + period stays PROCESSING, admin resolve.
- **KkiaPay stub test**: asserts the stub throws/returns UNCERTAIN as documented
  (so a route to KkiaPay fails safe, never silently mis-pays).
- **E2E smoke**: open period → process → assert payout statuses.

---

## 8. Build order

1. **A1** — `enum PaymentProvider` migration + backfill + `provider` column type
   change + `Tenant/Event.provider`. Regenerate client, TABLES.
2. **A2** — `PspGateway` port + `psp.types.ts`; refactor `FeexpayHttpClient` into
   `FeexpayGateway` (credentials injected, payout/balance methods added).
3. **A3** — `PspRegistry` (provider + credential resolution); rebind payin
   (`PaymentsService`, `FeexpayVerifyService`) through the registry. Payin tests
   green.
4. **A4** — `KkiaPayGateway` documented stub + registry wiring + fail-safe test.
5. **B1** — Payout migration (`PayoutPeriod`/`Payout`/`PayoutLine`/`PayoutJobLock`,
   enums) with `provider PaymentProvider`.
6. **B2** — `PayoutBalanceService` + tests.
7. **B3** — `PayoutJobLockService` + tests.
8. **B4** — `PayoutsService` orchestrator (6 layers) through the registry + tests.
9. **B5** — Organizer payout-destination settings endpoint + encryption + tests.
10. **B6** — `/admin/platform/payouts/*` controller + resolve + tests.
11. **B7** — E2E smoke + full suite green.

Each step: TDD (red first), build green, tests green. (Repo is **not** a git repo
right now, so the per-task commits in the source plan are deferred until git is
initialized — flagged as a follow-up.)

---

## 9. Open follow-ups (explicitly deferred)

- KkiaPay live adapter (needs KkiaPay API docs — payin init/status, payout
  init/status URLs + auth scheme).
- BYO commission recovery / reverse-charge (Flow B) — Phase 4 territory.
- Refund payouts.
- `git init` so per-task commits in the implementation plan are possible.
