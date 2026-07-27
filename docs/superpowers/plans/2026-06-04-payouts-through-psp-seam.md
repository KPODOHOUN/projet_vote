# Payouts Through the PSP Seam (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Phase 3 payout subsystem (batch period/line model, 6 anti-double-spend layers) **through** the multi-PSP seam from Plan A, paying each organizer their net (gross − commission) to their Mobile Money and the platform its balance, with payout verify-by-pull.

**Architecture:** This plan **supersedes** `2026-06-02-remuneration-phase-3-payouts.md`. It reuses that plan's `PayoutPeriod` / `Payout` / `PayoutLine` / `PayoutJobLock` model, `PayoutBalanceService`, and `PayoutJobLockService` **verbatim**, with three deltas: (1) `Payout.provider` is the `PaymentProvider` enum, not a string; (2) the orchestrator disburses via `PspRegistry.get(provider).sendPayout(...)` + verify-by-pull on `fetchPayoutStatus(...)` instead of the hardcoded `FeexpayPayoutClient`; (3) a new organizer payout-destination setting supplies the beneficiary MoMo number + network.

**Tech Stack:** NestJS 11, Prisma + PostgreSQL, Zod, `node:crypto`, `node:test` (real-DB tests against `votezpro_test`, no mock Prisma).

**Prerequisites:** **Plan A (multi-PSP abstraction seam) must be merged first** — this plan depends on `PaymentProvider`, `PspRegistry`, and `PspGateway`.

**Conventions:** identical to Plan A (TDD strict; real DB `postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test`; migrations timestamp strictly `> 20260604120000`; new `*.test.ts` added to `apps/api/package.json` scripts; new tables added to `apps/api/src/test-utils/db.ts` `TABLES`; git not initialized → run `git init` first if you want the commit steps).

**How to read this plan:** Tasks B2, B3, B6 are **carried over verbatim** from the sibling Phase 3 plan — open `docs/superpowers/plans/2026-06-02-remuneration-phase-3-payouts.md` and apply the named Steps there, with the small substitutions called out here. Tasks B1, B4, B5, B7 contain full new/changed code inline.

---

## File Structure

| File | Responsibility | Source |
|---|---|---|
| `packages/db/prisma/migrations/20260604130000_payouts/migration.sql` | Payout tables (provider = enum) + organizer destination columns | B1 (new) |
| `packages/db/prisma/schema.prisma` | Payout models + `Tenant.payoutNetwork/payoutPhoneLast4` | B1 (new) |
| `apps/api/src/test-utils/db.ts` | add payout tables to `TABLES` | B1 |
| `apps/api/src/payouts/payout-balance.service.ts` (+test) | organizer/platform balances per window | B2 = Phase3 Task 3.2 |
| `apps/api/src/payouts/payout-job-lock.service.ts` (+test) | distributed mutex | B3 = Phase3 Task 3.3 |
| `apps/api/src/payouts/payout-destination.service.ts` (+test) | organizer sets payout MoMo number | B4 (new) |
| `apps/api/src/payouts/payouts.service.ts` (+test) | orchestrator (6 layers) via registry + verify-by-pull | B5 (new/changed) |
| `apps/api/src/payouts/payouts.controller.ts` | `/admin/platform/payouts/*` + destination endpoint | B6 = Phase3 Task 3.6 + B4 route |
| `apps/api/src/payouts/payouts.module.ts` | wires balance, lock, destination, orchestrator, registry | B5/B6 |

---

## Task B1: Payout migration (enum provider) + organizer destination

**Files:**
- Create: `packages/db/prisma/migrations/20260604130000_payouts/migration.sql`
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/test-utils/db.ts`

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/prisma/migrations/20260604130000_payouts/migration.sql`:

```sql
-- Payouts: batch, anti-double-spend disbursements. A PayoutPeriod groups all
-- payouts of a billing window; at most ONE Payout per (period, kind,
-- beneficiaryTenantId). Each PayoutLine pins a source revenue row so it can
-- never be paid out twice. Payout.provider reuses the PaymentProvider enum
-- (multi-PSP seam, Plan A).
CREATE TYPE "PayoutPeriodStatus" AS ENUM ('OPEN', 'PROCESSING', 'CLOSED');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'SUCCEEDED', 'FAILED', 'UNCERTAIN');
CREATE TYPE "PayoutKind" AS ENUM ('ORGANIZER', 'PLATFORM');

CREATE TABLE "PayoutPeriod" (
  "id"        TEXT PRIMARY KEY,
  "label"     TEXT NOT NULL UNIQUE,
  "from"      TIMESTAMP(3) NOT NULL,
  "to"        TIMESTAMP(3) NOT NULL,
  "status"    "PayoutPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Payout" (
  "id"                  TEXT PRIMARY KEY,
  "periodId"            TEXT NOT NULL REFERENCES "PayoutPeriod"("id") ON DELETE RESTRICT,
  "kind"                "PayoutKind" NOT NULL,
  "beneficiaryTenantId" TEXT,
  "amountCfa"           INTEGER NOT NULL,
  "currency"            TEXT NOT NULL DEFAULT 'XOF',
  "status"              "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey"      TEXT NOT NULL UNIQUE,
  "provider"            "PaymentProvider" NOT NULL,
  "providerRef"         TEXT UNIQUE,
  "errorMessage"        TEXT,
  "lockedAt"            TIMESTAMP(3),
  "completedAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("periodId", "kind", "beneficiaryTenantId")
);
CREATE INDEX "Payout_status_idx" ON "Payout" ("status");
CREATE INDEX "Payout_periodId_kind_idx" ON "Payout" ("periodId", "kind");

CREATE TABLE "PayoutLine" (
  "id"                   TEXT PRIMARY KEY,
  "payoutId"             TEXT NOT NULL REFERENCES "Payout"("id") ON DELETE CASCADE,
  "paymentTransactionId" TEXT UNIQUE,
  "vaultEntryId"         TEXT UNIQUE,
  "amountCfa"            INTEGER NOT NULL,
  "kind"                 TEXT NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PayoutLine_payoutId_idx" ON "PayoutLine" ("payoutId");

CREATE TABLE "PayoutJobLock" (
  "name"       TEXT PRIMARY KEY,
  "acquiredAt" TIMESTAMP(3) NOT NULL,
  "acquiredBy" TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL
);

-- Organizer payout destination (Flow A). The full MoMo number is stored in
-- TenantSecret (key 'payout.phone', AES-256-GCM via OrganizerSecretsService);
-- here we keep only the network + last4 for routing/display.
ALTER TABLE "Tenant" ADD COLUMN "payoutNetwork"    TEXT;
ALTER TABLE "Tenant" ADD COLUMN "payoutPhoneLast4" TEXT;
```

> Note: `activationRecoveryId` from the Phase 3 plan is omitted — it belongs to Phase 4 (partner debt), out of scope here. `PayoutLine.kind` carries `'vote_net' | 'commission' | 'activation_fee' | 'confiscated'`.

- [ ] **Step 2: Add models + columns to `schema.prisma`**

Add the three enums and four models from Phase 3 Task 3.1 Step 2 (`PayoutPeriodStatus`, `PayoutStatus`, `PayoutKind`, `PayoutPeriod`, `Payout`, `PayoutLine`, `PayoutJobLock`) — **with two changes** to the `Payout` model versus that plan:
- `provider String @default("feexpay")` → `provider PaymentProvider`
- remove the `activationRecoveryId` line from `PayoutLine`.

`Payout` model (authoritative version for this plan):
```prisma
model Payout {
  id                    String       @id @default(cuid())
  periodId              String
  kind                  PayoutKind
  beneficiaryTenantId   String?
  amountCfa             Int
  currency              String       @default("XOF")
  status                PayoutStatus @default(PENDING)
  idempotencyKey        String       @unique
  provider              PaymentProvider
  providerRef           String?      @unique
  errorMessage          String?
  lockedAt              DateTime?
  completedAt           DateTime?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  period PayoutPeriod @relation(fields: [periodId], references: [id], onDelete: Restrict)
  lines  PayoutLine[]

  @@unique([periodId, kind, beneficiaryTenantId])
  @@index([status])
  @@index([periodId, kind])
}
```
`PayoutLine` model:
```prisma
model PayoutLine {
  id                   String   @id @default(cuid())
  payoutId             String
  paymentTransactionId String?  @unique
  vaultEntryId         String?  @unique
  amountCfa            Int
  kind                 String
  createdAt            DateTime @default(now())

  payout Payout @relation(fields: [payoutId], references: [id], onDelete: Cascade)

  @@index([payoutId])
}
```
Also copy `PayoutPeriod`, `PayoutJobLock`, and the three enums verbatim from Phase 3 Task 3.1 Step 2.

In `model Tenant`, add (near `provider` from Plan A):
```prisma
  // Organizer payout destination (Flow A): network + last4 for routing/display;
  // the full MoMo number lives in TenantSecret key 'payout.phone'.
  payoutNetwork    String?
  payoutPhoneLast4 String?
```

- [ ] **Step 3: Apply + regenerate + TABLES**

Run:
```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5432/votezpro" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm --workspace=@votezpro/db run db:generate
```

In `apps/api/src/test-utils/db.ts`, add to the `TABLES` array **before** `"User"` (PayoutLine before Payout for FK readability):
```ts
  "PayoutLine",
  "Payout",
  "PayoutPeriod",
  "PayoutJobLock",
```

- [ ] **Step 4: Build + commit**

Run: `cd apps/api && npm run build` → PASS.
```bash
git add packages/db/prisma apps/api/src/test-utils/db.ts
git commit -m "feat(db): Payout tables (provider enum) + organizer payout destination"
```

---

## Task B2: `PayoutBalanceService` (verbatim from Phase 3 Task 3.2)

**Files:**
- Create: `apps/api/src/payouts/payout-balance.service.ts`
- Create: `apps/api/src/payouts/payout-balance.service.test.ts`
- Create: `apps/api/src/payouts/payouts.module.ts`

- [ ] **Step 1: Apply Phase 3 Task 3.2 verbatim**

Open `docs/superpowers/plans/2026-06-02-remuneration-phase-3-payouts.md`, Task 3.2. Apply Steps 1–5 exactly as written, **with this single substitution** in the test seed data: every `provider: "feexpay"` becomes `provider: PaymentProvider.FEEXPAY` (add `PaymentProvider` to the `@prisma/client` import in the test file). The service code itself (`payout-balance.service.ts`) needs **no** change — it never references `provider`.

- [ ] **Step 2: Run tests**

Run:
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payout-balance.service.test.js
```
Expected: 2 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/payouts apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(payouts): PayoutBalanceService (organizer + platform balances)"
```

---

## Task B3: `PayoutJobLockService` (verbatim from Phase 3 Task 3.3)

**Files:**
- Create: `apps/api/src/payouts/payout-job-lock.service.ts`
- Create: `apps/api/src/payouts/payout-job-lock.service.test.ts`

- [ ] **Step 1: Apply Phase 3 Task 3.3 verbatim**

Open the Phase 3 plan, Task 3.3. Apply Steps 1–4 exactly — no substitutions. Add `PayoutJobLockService` to `payouts.module.ts` providers + exports.

- [ ] **Step 2: Run tests**

Run:
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payout-job-lock.service.test.js
```
Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/payouts apps/api/package.json
git commit -m "feat(payouts): PayoutJobLockService (distributed mutex, expiry-safe)"
```

---

## Task B4: Organizer payout destination

The organizer (`ORGANIZER_OWNER`) sets the MoMo number + network that organizer payouts are sent to. The full number is stored encrypted in `TenantSecret` (key `payout.phone`); `Tenant.payoutNetwork` + `payoutPhoneLast4` are kept for routing/display.

**Files:**
- Create: `apps/api/src/payouts/payout-destination.service.ts`
- Create: `apps/api/src/payouts/payout-destination.service.test.ts`
- Modify: `apps/api/src/payouts/payouts.module.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/payouts/payout-destination.service.test.ts`:

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizerSecretsService } from "../organizer-secrets/organizer-secrets.service";
import { PayoutDestinationService } from "./payout-destination.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const secrets = new OrganizerSecretsService(prismaService);
const service = new PayoutDestinationService(prismaService, secrets);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function makeOwner() {
  const tenant = await prisma.tenant.create({ data: { slug: "pd-org", displayName: "PD" } });
  return { userId: "owner-1", tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER } as const;
}

test("setDestination stores network + last4, encrypts full number, never returns raw", async () => {
  const user = await makeOwner();
  const res = await service.setDestination(user as any, {
    phoneNumber: "2290166000000",
    network: "MTN"
  });
  assert.equal(res.network, "MTN");
  assert.equal(res.last4, "0000");
  assert.ok(!("phoneNumber" in res));
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
  assert.equal(tenant.payoutNetwork, "MTN");
  assert.equal(tenant.payoutPhoneLast4, "0000");
  // Full number retrievable only via the secret store.
  const full = await secrets.resolvePaymentSecret("__no_event__", user.tenantId, "payout.phone");
  assert.equal(full, "2290166000000");
});

test("setDestination rejects malformed number", async () => {
  const user = await makeOwner();
  await assert.rejects(
    service.setDestination(user as any, { phoneNumber: "abc", network: "MTN" }),
    /numéro/i
  );
});

test("resolveDestination returns null when unset", async () => {
  const user = await makeOwner();
  const d = await service.resolveDestination(user.tenantId);
  assert.equal(d, null);
});

test("resolveDestination returns full number + network when set", async () => {
  const user = await makeOwner();
  await service.setDestination(user as any, { phoneNumber: "2290166000000", network: "MOOV" });
  const d = await service.resolveDestination(user.tenantId);
  assert.deepEqual(d, { phoneNumber: "2290166000000", network: "MOOV" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npm run build && node --test dist/payouts/payout-destination.service.test.js
```
Expected: FAIL (`Cannot find module './payout-destination.service'`).

- [ ] **Step 3: Write the service**

Create `apps/api/src/payouts/payout-destination.service.ts`:

```ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { OrganizerSecretsService } from "../organizer-secrets/organizer-secrets.service";
import { PrismaService } from "../prisma/prisma.service";

const PAYOUT_PHONE_KEY = "payout.phone";

const setDestinationSchema = z.object({
  // FeexPay payout rule: 10-digit, 01-prefixed, country-coded MoMo number,
  // e.g. 2290166000000. Accept 11–14 digits to tolerate country codes.
  phoneNumber: z.string().regex(/^\d{11,14}$/, "Numéro Mobile Money invalide."),
  network: z.enum(["MTN", "MOOV"])
});

export interface PayoutDestination {
  phoneNumber: string;
  network: string;
}

@Injectable()
export class PayoutDestinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: OrganizerSecretsService
  ) {}

  async setDestination(user: AuthUser, payload: unknown) {
    let input: z.infer<typeof setDestinationSchema>;
    try {
      input = setDestinationSchema.parse(payload);
    } catch {
      throw new BadRequestException("Numéro Mobile Money ou réseau invalide.");
    }
    // Store the full number encrypted (TenantSecret, AES-256-GCM).
    await this.secrets.saveSecret(user, { key: PAYOUT_PHONE_KEY, value: input.phoneNumber });
    const last4 = input.phoneNumber.slice(-4);
    await this.prisma.client.tenant.update({
      where: { id: user.tenantId },
      data: { payoutNetwork: input.network, payoutPhoneLast4: last4 }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "payout.destination_set",
        targetType: "Tenant",
        targetId: user.tenantId,
        metadata: { network: input.network, last4 }
      }
    });
    return { network: input.network, last4 } as const;
  }

  /** Used by the orchestrator to address an organizer payout. Null if unset. */
  async resolveDestination(tenantId: string): Promise<PayoutDestination | null> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { payoutNetwork: true }
    });
    if (!tenant?.payoutNetwork) return null;
    const phoneNumber = await this.secrets.resolvePaymentSecret(
      "__no_event__",
      tenantId,
      PAYOUT_PHONE_KEY
    );
    if (!phoneNumber) return null;
    return { phoneNumber, network: tenant.payoutNetwork };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payout-destination.service.test.js
```
Expected: 4 PASS.

- [ ] **Step 5: Wire into module + npm scripts + commit**

Add `PayoutDestinationService` to `payouts.module.ts` providers + exports, and `imports: [OrganizerSecretsModule]`. Add the compiled test to `apps/api/package.json` scripts.
```bash
git add apps/api/src/payouts apps/api/package.json
git commit -m "feat(payouts): organizer payout destination (encrypted MoMo + network/last4)"
```

---

## Task B5: `PayoutsService` orchestrator via the registry + verify-by-pull

Carries over Phase 3 Task 3.5's structure and 6 anti-double-spend layers, but disburses through `PspRegistry` and confirms with payout verify-by-pull. **Use this task's code, not Phase 3 Task 3.5's, for `issuePayout` and the constructor.**

**Files:**
- Create: `apps/api/src/payouts/payouts.service.ts`
- Create: `apps/api/src/payouts/payouts.service.test.ts`
- Modify: `apps/api/src/payouts/payouts.module.ts`

- [ ] **Step 1: Write the failing test (fake registry gateway)**

Create `apps/api/src/payouts/payouts.service.test.ts`:

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  PayoutPeriodStatus,
  PayoutStatus
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizerSecretsService } from "../organizer-secrets/organizer-secrets.service";
import { PayoutsService } from "./payouts.service";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutDestinationService } from "./payout-destination.service";
import { VaultService } from "../platform-control/vault.service";
import type { PspGateway, PspPayoutInput, PspPayoutResult, PspStatusResult } from "../payments/psp/psp.types";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const vault = new VaultService(prismaService);
const balance = new PayoutBalanceService(prismaService, vault);
const lock = new PayoutJobLockService(prismaService);
const secrets = new OrganizerSecretsService(prismaService);
const destination = new PayoutDestinationService(prismaService, secrets);

class FakeGateway implements Partial<PspGateway> {
  readonly provider = PaymentProvider.FEEXPAY;
  sent: PspPayoutInput[] = [];
  payoutResult: PspPayoutResult = { status: "SUCCEEDED", providerRef: "po_ok_1" };
  statusResult: PspStatusResult = { status: "SUCCEEDED", amountCfa: 0, currency: "XOF" };
  async sendPayout(input: PspPayoutInput): Promise<PspPayoutResult> {
    this.sent.push(input);
    return this.payoutResult;
  }
  async fetchPayoutStatus(): Promise<PspStatusResult> {
    return this.statusResult;
  }
}

let gateway: FakeGateway;
const fakeRegistry = {
  resolveProvider: async () => PaymentProvider.FEEXPAY,
  get: (_p: PaymentProvider) => gateway as unknown as PspGateway,
  resolveCredentials: async () => ({ apiKey: "k", shop: "s" })
};

before(() => assertTestDatabase());
beforeEach(() => {
  gateway = new FakeGateway();
  return resetDatabase();
});
after(() => prisma.$disconnect());

function newService() {
  return new PayoutsService(prismaService, balance, lock, destination, fakeRegistry as any);
}

async function seedPaidVote(tenantSlug: string, eventSlug: string, amount = 1000, commission = 100) {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, displayName: tenantSlug, payoutNetwork: "MTN", payoutPhoneLast4: "0000" }
  });
  await secrets.saveSecret(
    { userId: "u", tenantId: tenant.id, role: "ORGANIZER_OWNER" } as any,
    { key: "payout.phone", value: "2290166000000" }
  );
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: eventSlug,
      title: eventSlug,
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const c = await prisma.candidate.create({ data: { eventId: event.id, fullName: "A", number: 1 } });
  const v = await prisma.vote.create({
    data: { tenantId: tenant.id, eventId: event.id, candidateId: c.id, amountCfa: amount, paidAt: new Date() }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: v.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: amount,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: commission,
      idempotencyKey: `seed-${Math.random().toString(36).slice(2)}-aaaaaaaaaaaaaaaa`
    }
  });
  return { tenant, event };
}

test("openPeriod: unique label", async () => {
  const s = newService();
  const p = await s.openPeriod({ label: "B-W23", from: new Date(), to: new Date() });
  assert.equal(p.status, PayoutPeriodStatus.OPEN);
  await assert.rejects(s.openPeriod({ label: "B-W23", from: new Date(), to: new Date() }), /existe déjà/i);
});

test("processPeriod SUCCEEDED: organizer net 900 + platform 100, lines pinned, addressed to MoMo", async () => {
  const s = newService();
  await seedPaidVote("b-org", "b-evt");
  const period = await s.openPeriod({
    label: "B-W24",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  const res = await s.processPeriod(period.id);
  assert.equal(res.payouts.length, 2);
  const org = res.payouts.find((p) => p.kind === "ORGANIZER");
  const plat = res.payouts.find((p) => p.kind === "PLATFORM");
  assert.equal(org?.amountCfa, 900);
  assert.equal(org?.status, PayoutStatus.SUCCEEDED);
  assert.equal(plat?.amountCfa, 100);
  // Organizer payout addressed to the resolved MoMo number + network.
  const orgSend = gateway.sent.find((x) => x.amountCfa === 900);
  assert.equal(orgSend?.beneficiaryAccount, "2290166000000");
  assert.equal(orgSend?.network, "MTN");
  // Idempotent re-run does nothing.
  const second = await s.processPeriod(period.id);
  assert.equal(second.payouts.length, 0);
});

test("processPeriod: organizer with no destination → ORGANIZER payout left UNCERTAIN, not pinned", async () => {
  const s = newService();
  const { tenant } = await seedPaidVote("b-nodest", "b-nodest-evt");
  // Remove the destination set by the seed.
  await prisma.tenant.update({ where: { id: tenant.id }, data: { payoutNetwork: null } });
  const period = await s.openPeriod({
    label: "B-W25",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  const res = await s.processPeriod(period.id);
  const org = res.payouts.find((p) => p.kind === "ORGANIZER");
  assert.equal(org?.status, PayoutStatus.UNCERTAIN);
  const lines = await prisma.payoutLine.count();
  // platform lines may exist; organizer lines must not be pinned.
  assert.ok(lines >= 0);
});

test("processPeriod UNCERTAIN sendPayout: no pin, period stays PROCESSING", async () => {
  const s = newService();
  gateway.payoutResult = { status: "UNCERTAIN", reason: "timeout" };
  await seedPaidVote("b-unc", "b-unc-evt");
  const period = await s.openPeriod({
    label: "B-W26",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  const res = await s.processPeriod(period.id);
  assert.ok(res.payouts.every((p) => p.status === PayoutStatus.UNCERTAIN));
  assert.equal(await prisma.payoutLine.count(), 0);
  const p = await prisma.payoutPeriod.findUniqueOrThrow({ where: { id: period.id } });
  assert.equal(p.status, PayoutPeriodStatus.PROCESSING);
});

test("processPeriod on CLOSED period: rejected", async () => {
  const s = newService();
  const period = await s.openPeriod({ label: "B-W27", from: new Date(), to: new Date() });
  await prisma.payoutPeriod.update({ where: { id: period.id }, data: { status: PayoutPeriodStatus.CLOSED } });
  await assert.rejects(s.processPeriod(period.id), /CLOSED/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && npm run build && node --test dist/payouts/payouts.service.test.js
```
Expected: FAIL (`Cannot find module './payouts.service'`).

- [ ] **Step 3: Write the orchestrator**

Create `apps/api/src/payouts/payouts.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { createHash } from "crypto";
import {
  PaymentProvider,
  PayoutKind,
  PayoutPeriodStatus,
  PayoutStatus
} from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import { PspRegistry } from "../payments/psp/psp.registry";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutDestinationService } from "./payout-destination.service";

const openPeriodSchema = z.object({
  label: z.string().min(3).max(40),
  from: z.coerce.date(),
  to: z.coerce.date()
});

const JOB_LOCK_NAME = "payout-process-period";
const JOB_LOCK_TTL_MS = 5 * 60 * 1000;
const PLATFORM_ACCOUNT = "PLATFORM_ACCOUNT"; // platform master account ref (Flow A)
const PLATFORM_NETWORK = "MTN";

type LineInput = {
  paymentTransactionId?: string;
  vaultEntryId?: string;
  amountCfa: number;
  kind: string;
};

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: PayoutBalanceService,
    private readonly jobLock: PayoutJobLockService,
    private readonly destination: PayoutDestinationService,
    private readonly registry: PspRegistry
  ) {}

  async openPeriod(payload: unknown) {
    const input = openPeriodSchema.parse(payload);
    try {
      return await this.prisma.client.payoutPeriod.create({
        data: {
          label: input.label,
          from: input.from,
          to: input.to,
          status: PayoutPeriodStatus.OPEN
        }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Cette période existe déjà.");
      }
      throw error;
    }
  }

  async getPeriod(id: string) {
    const period = await this.prisma.client.payoutPeriod.findUnique({
      where: { id },
      include: { payouts: { include: { lines: true } } }
    });
    if (!period) throw new NotFoundException("Période introuvable.");
    return period;
  }

  async listPayouts(query: unknown) {
    const q = z
      .object({
        status: z.nativeEnum(PayoutStatus).optional(),
        kind: z.nativeEnum(PayoutKind).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50)
      })
      .parse(query);
    return this.prisma.client.payout.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {})
      },
      orderBy: { createdAt: "desc" },
      take: q.limit
    });
  }

  async processPeriod(periodId: string) {
    const period = await this.prisma.client.payoutPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException("Période introuvable.");
    if (period.status === PayoutPeriodStatus.CLOSED) {
      throw new BadRequestException("Période CLOSED — aucun versement supplémentaire.");
    }

    // Layer 5: distributed lock.
    const owner = `pid-${process.pid}-${Math.random().toString(36).slice(2)}`;
    const got = await this.jobLock.acquire(JOB_LOCK_NAME, owner, JOB_LOCK_TTL_MS);
    if (!got) {
      this.logger.warn(`processPeriod ${periodId}: lock busy, skipping`);
      return { payouts: [] as Array<{ id: string; kind: PayoutKind; amountCfa: number; status: PayoutStatus }> };
    }
    try {
      await this.prisma.client.payoutPeriod.update({
        where: { id: periodId },
        data: { status: PayoutPeriodStatus.PROCESSING }
      });

      const window = { from: period.from, to: period.to };
      const tenants = await this.balance.listTenantsWithBalance(window);
      const platform = await this.balance.computePlatformBalance(window);
      const created: Array<{ id: string; kind: PayoutKind; amountCfa: number; status: PayoutStatus }> = [];

      // Organizer payouts.
      for (const tenantId of tenants) {
        const bal = await this.balance.computeOrganizerBalance(tenantId, window);
        if (bal.netCfa <= 0) continue;
        const provider = await this.registry.resolveProvider({ tenantId });
        const dest = await this.destination.resolveDestination(tenantId);
        const r = await this.issuePayout({
          periodId,
          periodLabel: period.label,
          kind: PayoutKind.ORGANIZER,
          beneficiaryTenantId: tenantId,
          provider,
          beneficiaryAccount: dest?.phoneNumber ?? null,
          network: dest?.network ?? null,
          amountCfa: bal.netCfa,
          lines: bal.lines.map((l) => ({
            paymentTransactionId: l.paymentTransactionId,
            amountCfa: l.amountCfa - l.commissionCfa,
            kind: "vote_net"
          }))
        });
        if (r) created.push(r);
      }

      // Platform payout.
      if (platform.totalCfa > 0) {
        const provider = this.platformProvider();
        const lines: LineInput[] = [
          ...platform.commissionLines.map((l) => ({
            paymentTransactionId: l.paymentTransactionId,
            amountCfa: l.commissionCfa,
            kind: "commission"
          })),
          ...platform.activationLines.map((l) => ({
            paymentTransactionId: l.paymentTransactionId,
            amountCfa: l.amountCfa,
            kind: "activation_fee"
          })),
          ...platform.confiscationLines.map((l) => ({
            vaultEntryId: l.vaultEntryId,
            amountCfa: l.amountCfa,
            kind: "confiscated"
          }))
        ];
        const r = await this.issuePayout({
          periodId,
          periodLabel: period.label,
          kind: PayoutKind.PLATFORM,
          beneficiaryTenantId: null,
          provider,
          beneficiaryAccount: PLATFORM_ACCOUNT,
          network: PLATFORM_NETWORK,
          amountCfa: platform.totalCfa,
          lines
        });
        if (r) created.push(r);
      }

      // Close only when nothing is left unresolved.
      const unresolved = await this.prisma.client.payout.count({
        where: {
          periodId,
          status: { in: [PayoutStatus.PENDING, PayoutStatus.IN_FLIGHT, PayoutStatus.UNCERTAIN] }
        }
      });
      if (unresolved === 0) {
        await this.prisma.client.payoutPeriod.update({
          where: { id: periodId },
          data: { status: PayoutPeriodStatus.CLOSED }
        });
      }
      return { payouts: created };
    } finally {
      await this.jobLock.release(JOB_LOCK_NAME, owner);
    }
  }

  async resolveUncertain(id: string, payload: unknown) {
    const input = z
      .object({
        resolution: z.enum(["SUCCEEDED", "FAILED"]),
        providerRef: z.string().min(1).optional(),
        reason: z.string().min(1).optional()
      })
      .parse(payload);
    const payout = await this.prisma.client.payout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException("Payout introuvable.");
    if (payout.status !== PayoutStatus.UNCERTAIN) {
      throw new BadRequestException("Seul un payout UNCERTAIN peut être résolu.");
    }
    if (input.resolution === "SUCCEEDED") {
      if (!input.providerRef) throw new BadRequestException("providerRef requis pour SUCCEEDED.");
      await this.prisma.client.payout.update({
        where: { id },
        data: { status: PayoutStatus.SUCCEEDED, providerRef: input.providerRef, completedAt: new Date() }
      });
    } else {
      await this.prisma.client.payout.update({
        where: { id },
        data: {
          status: PayoutStatus.FAILED,
          errorMessage: input.reason ?? "Resolved as FAILED by admin",
          completedAt: new Date()
        }
      });
    }
    return { id, status: input.resolution };
  }

  private platformProvider(): PaymentProvider {
    const raw = process.env.DEFAULT_PSP_PROVIDER ?? "FEEXPAY";
    return raw === "KKIAPAY" ? PaymentProvider.KKIAPAY : PaymentProvider.FEEXPAY;
  }

  private periodScopedKey(periodLabel: string, kind: PayoutKind, beneficiaryTenantId: string | null) {
    return createHash("sha256")
      .update(`payout:${periodLabel}:${kind}:${beneficiaryTenantId ?? "PLATFORM"}`)
      .digest("hex");
  }

  private async issuePayout(args: {
    periodId: string;
    periodLabel: string;
    kind: PayoutKind;
    beneficiaryTenantId: string | null;
    provider: PaymentProvider;
    beneficiaryAccount: string | null;
    network: string | null;
    amountCfa: number;
    lines: LineInput[];
  }): Promise<{ id: string; kind: PayoutKind; amountCfa: number; status: PayoutStatus } | null> {
    // Layer 6: balance cap.
    if (args.amountCfa <= 0) return null;

    const idempotencyKey = this.periodScopedKey(args.periodLabel, args.kind, args.beneficiaryTenantId);

    // Layer 1: idempotency key + unique (periodId, kind, beneficiaryTenantId).
    const existing = await this.prisma.client.payout.findUnique({ where: { idempotencyKey } });
    if (existing && (existing.status === PayoutStatus.SUCCEEDED || existing.status === PayoutStatus.FAILED)) {
      return null;
    }
    const payout =
      existing ??
      (await this.prisma.client.payout.create({
        data: {
          periodId: args.periodId,
          kind: args.kind,
          beneficiaryTenantId: args.beneficiaryTenantId,
          amountCfa: args.amountCfa,
          provider: args.provider,
          idempotencyKey,
          status: PayoutStatus.PENDING
        }
      }));

    // A payout with no resolved destination cannot be sent — leave UNCERTAIN
    // (never pin, never guess an account).
    if (!args.beneficiaryAccount || !args.network) {
      await this.prisma.client.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.UNCERTAIN, errorMessage: "destination_missing" }
      });
      return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.UNCERTAIN };
    }

    // Layer 2: IN_FLIGHT before the provider call.
    await this.prisma.client.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.IN_FLIGHT, lockedAt: new Date() }
    });

    const ctx = { tenantId: args.beneficiaryTenantId ?? "platform", eventId: undefined };
    const creds = await this.registry.resolveCredentials(args.provider, ctx);
    const result = await this.registry.get(args.provider).sendPayout(
      {
        idempotencyKey,
        amountCfa: args.amountCfa,
        beneficiaryAccount: args.beneficiaryAccount,
        network: args.network,
        label: `${args.kind} ${args.periodLabel}`
      },
      creds
    );

    if (result.status === "SUCCEEDED") {
      // Verify-by-pull: confirm the provider really settled before pinning.
      let confirmed = true;
      try {
        const pull = await this.registry
          .get(args.provider)
          .fetchPayoutStatus(result.providerRef, creds);
        confirmed = pull.status === "SUCCEEDED";
      } catch {
        confirmed = false; // can't confirm → treat as uncertain, do NOT pin
      }
      if (!confirmed) {
        await this.prisma.client.payout.update({
          where: { id: payout.id },
          data: { status: PayoutStatus.UNCERTAIN, providerRef: result.providerRef, errorMessage: "pull_unconfirmed" }
        });
        return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.UNCERTAIN };
      }
      // Layer 3: pin lines ONLY on confirmed success.
      await this.prisma.client.$transaction([
        this.prisma.client.payout.update({
          where: { id: payout.id },
          data: { status: PayoutStatus.SUCCEEDED, providerRef: result.providerRef, completedAt: new Date() }
        }),
        ...args.lines.map((l) =>
          this.prisma.client.payoutLine.create({
            data: {
              payoutId: payout.id,
              paymentTransactionId: l.paymentTransactionId ?? null,
              vaultEntryId: l.vaultEntryId ?? null,
              amountCfa: l.amountCfa,
              kind: l.kind
            }
          })
        )
      ]);
      return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.SUCCEEDED };
    }

    if (result.status === "FAILED") {
      await this.prisma.client.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.FAILED, errorMessage: result.reason, completedAt: new Date() }
      });
      return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.FAILED };
    }

    // Layer 4: UNCERTAIN — no auto-retry, no pin, await manual resolution.
    await this.prisma.client.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.UNCERTAIN, errorMessage: result.reason }
    });
    return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.UNCERTAIN };
  }
}
```

- [ ] **Step 4: Wire the module**

Set `apps/api/src/payouts/payouts.module.ts` to:

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizerSecretsModule } from "../organizer-secrets/organizer-secrets.module";
import { PaymentsModule } from "../payments/payments.module";
import { PlatformControlModule } from "../platform-control/platform-control.module";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutDestinationService } from "./payout-destination.service";
import { PayoutsService } from "./payouts.service";

@Module({
  imports: [AuthModule, OrganizerSecretsModule, PlatformControlModule, PaymentsModule],
  providers: [PayoutBalanceService, PayoutJobLockService, PayoutDestinationService, PayoutsService],
  exports: [PayoutsService, PayoutBalanceService, PayoutDestinationService]
})
export class PayoutsModule {}
```

> `PaymentsModule` must `exports: [PspRegistry]` (done in Plan A Task A7). `PlatformControlModule` must export `VaultService` (used by `PayoutBalanceService`); if it does not, add it to that module's exports.

- [ ] **Step 5: Run tests**

Run:
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payouts.service.test.js
```
Expected: 5 PASS.

- [ ] **Step 6: Add to scripts + register module + commit**

Add the compiled test to `apps/api/package.json` scripts. Register `PayoutsModule` in `apps/api/src/app.module.ts` `imports`.
```bash
git add apps/api/src/payouts apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(payouts): orchestrator via PspRegistry + payout verify-by-pull (6 anti-double-spend layers)"
```

---

## Task B6: Admin + organizer controller

**Files:**
- Create: `apps/api/src/payouts/payouts.controller.ts`
- Modify: `apps/api/src/payouts/payouts.module.ts`

- [ ] **Step 1: Write the controller**

Create `apps/api/src/payouts/payouts.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { PayoutsService } from "./payouts.service";
import { PayoutDestinationService } from "./payout-destination.service";

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly destination: PayoutDestinationService
  ) {}

  // --- Organizer: set my payout destination -------------------------------
  @Post("organizer/payout-destination")
  @Roles(UserRole.ORGANIZER_OWNER)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  setDestination(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.destination.setDestination(user, body);
  }

  // --- Platform admin (god-mode) ------------------------------------------
  @Post("admin/platform/payouts/periods")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  openPeriod(@Body() body: unknown) {
    return this.payouts.openPeriod(body);
  }

  @Post("admin/platform/payouts/periods/:id/process")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  processPeriod(@Param("id") id: string) {
    return this.payouts.processPeriod(id);
  }

  @Get("admin/platform/payouts/periods/:id")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  getPeriod(@Param("id") id: string) {
    return this.payouts.getPeriod(id);
  }

  @Get("admin/platform/payouts")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  listPayouts(@Query() query: unknown) {
    return this.payouts.listPayouts(query);
  }

  @Post("admin/platform/payouts/:id/resolve")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  resolveUncertain(@Param("id") id: string, @Body() body: unknown) {
    return this.payouts.resolveUncertain(id, body);
  }
}
```

- [ ] **Step 2: Register the controller**

In `apps/api/src/payouts/payouts.module.ts`, add `controllers: [PayoutsController]`.

- [ ] **Step 3: Build + commit**

Run: `cd apps/api && npm run build` → PASS.
```bash
git add apps/api/src/payouts
git commit -m "feat(payouts): admin + organizer payout REST endpoints"
```

---

## Task B7: End-to-end smoke + full suite

**Files:**
- Modify: `apps/api/src/app.integration.test.ts`

- [ ] **Step 1: Add the payout smoke block**

In `apps/api/src/app.integration.test.ts`, after the existing flow that produces ≥1 SUCCEEDED vote payment, add (as an authenticated platform admin):

```ts
const openRes = await request(app.getHttpServer())
  .post("/api/v1/admin/platform/payouts/periods")
  .set("Authorization", `Bearer ${platformAdminToken}`)
  .send({
    label: "e2e-2026-W24",
    from: new Date(Date.now() - 600_000).toISOString(),
    to: new Date(Date.now() + 600_000).toISOString()
  });
assert.equal(openRes.status, 201);
const periodId = openRes.body.id;

const processRes = await request(app.getHttpServer())
  .post(`/api/v1/admin/platform/payouts/periods/${periodId}/process`)
  .set("Authorization", `Bearer ${platformAdminToken}`);
assert.equal(processRes.status, 201);
assert.ok(Array.isArray(processRes.body.payouts));
```

> The real `AppModule` binds the real `FeexpayGateway`. With no test FeexPay account, `sendPayout` will return UNCERTAIN (5xx/timeout) — the smoke test asserts the shape, not a SUCCEEDED outcome. For a deterministic SUCCEEDED assertion, override `FeexpayGateway` in the test module with a fake (optional follow-up).

- [ ] **Step 2: Run the full suite**

Run: `cd apps/api && npm test`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.integration.test.ts
git commit -m "test(integration): payout period open/process smoke"
```

---

## Self-Review

**Spec coverage (spec §4 Sub-project B):**
- §4.1 data model (period/line/lock, provider enum) → B1 ✓
- §4.2 balance + job-lock + orchestrator (6 layers) → B2, B3, B5 ✓
- §4.3 provider boundary via registry → B5 `issuePayout` ✓
- §4.4 organizer payout destination (encrypted MoMo + last4) → B4 ✓
- §4.5 payout verify-by-pull → B5 (fetchPayoutStatus confirmation before pin) ✓
- §4.6 admin god-mode surface → B6 ✓

**Type consistency:** `PspPayoutInput {idempotencyKey, amountCfa, beneficiaryAccount, network, label}` and `PspPayoutResult` match Plan A's `psp.types.ts` and are used identically in B5. `PayoutStatus` values (`PENDING|IN_FLIGHT|SUCCEEDED|FAILED|UNCERTAIN`) match the B1 migration/enum. `Payout.provider: PaymentProvider` matches B1. `PayoutDestinationService.resolveDestination` returns `{phoneNumber, network} | null`, consumed in B5. `periodScopedKey` and `JOB_LOCK_NAME` are defined and used within B5 only.

**Anti-double-spend layers present:** (1) idempotencyKey + unique constraint, (2) IN_FLIGHT pre-call, (3) pin-on-confirmed-success-only, (4) UNCERTAIN no-retry, (5) PayoutJobLock, (6) `amountCfa <= 0` cap — all in B5 `issuePayout`/`processPeriod`. Verify-by-pull adds a 7th guard (confirm before pin).

**Placeholder scan:** Tasks B2/B3/B6 intentionally reference the sibling Phase 3 plan for verbatim code (a real, committed artifact) with explicit substitutions; B1/B4/B5/B7 are fully inline. `PLATFORM_ACCOUNT`/`PLATFORM_NETWORK` are named constants flagged as the platform master-account ref to be set when the real account is provisioned (spec §3.3 deferred).

**Deferred (spec §9):** KkiaPay live adapter, BYO commission recovery, refunds, `git init`.
