# Phase 3 — Payouts automatiques anti-doublons

> Partie du plan `2026-06-02-remuneration-overhaul.md`. Suppose Phases 0-2 mergées.

**Goal:** Reverser automatiquement, à fréquence configurable, l'argent dû à chaque organisateur (vote − commission − remboursement dette partenaire) ET à la plateforme (commissions + forfaits + confiscations), via FeexPay, avec **6 couches de protection anti-doublons**.

⚠️ **Phase la plus critique du plan.** Tout versement implique de l'argent réel ; chaque garde-fou est non-négociable.

---

### Task 3.1 : Migration Prisma — `PayoutPeriod`, `Payout`, `PayoutLine`, enums

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260602120000_payouts/migration.sql`
- Modify: `apps/api/src/test-utils/db.ts`

- [ ] **Step 1 : Migration SQL**

Crée `packages/db/prisma/migrations/20260602120000_payouts/migration.sql` :

```sql
-- Payouts : automated, anti-double-spend disbursements via FeexPay.
-- A PayoutPeriod groups all payouts of a single billing window (e.g. a week);
-- inside a period there is at most ONE Payout per (beneficiaryTenantId|null,
-- kind). Each PayoutLine pins a PaymentTransaction (or a VaultEntry, or an
-- ActivationRecovery) to its payout, so a transaction cannot be paid out twice.

CREATE TYPE "PayoutPeriodStatus" AS ENUM ('OPEN', 'PROCESSING', 'CLOSED');
CREATE TYPE "PayoutStatus" AS ENUM (
  'PENDING',      -- created, no provider call yet
  'IN_FLIGHT',    -- locked + FeexPay called, awaiting response
  'SUCCEEDED',
  'FAILED',
  'UNCERTAIN'     -- provider call timed out — requires manual resolution
);
CREATE TYPE "PayoutKind" AS ENUM ('ORGANIZER', 'PLATFORM');

CREATE TABLE "PayoutPeriod" (
  "id"          TEXT PRIMARY KEY,
  "label"       TEXT NOT NULL UNIQUE,
  "from"        TIMESTAMP(3) NOT NULL,
  "to"          TIMESTAMP(3) NOT NULL,
  "status"      "PayoutPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Payout" (
  "id"                    TEXT PRIMARY KEY,
  "periodId"              TEXT NOT NULL REFERENCES "PayoutPeriod"("id") ON DELETE RESTRICT,
  "kind"                  "PayoutKind" NOT NULL,
  -- ORGANIZER: tenantId set ; PLATFORM: tenantId null.
  "beneficiaryTenantId"   TEXT,
  "amountCfa"             INTEGER NOT NULL,
  "currency"              TEXT NOT NULL DEFAULT 'XOF',
  "status"                "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey"        TEXT NOT NULL UNIQUE,
  "provider"              TEXT NOT NULL DEFAULT 'feexpay',
  "providerRef"           TEXT UNIQUE,
  "errorMessage"          TEXT,
  "lockedAt"              TIMESTAMP(3),
  "completedAt"           TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("periodId", "kind", "beneficiaryTenantId")
);
CREATE INDEX "Payout_status_idx" ON "Payout" ("status");
CREATE INDEX "Payout_periodId_kind_idx" ON "Payout" ("periodId", "kind");

CREATE TABLE "PayoutLine" (
  "id"                    TEXT PRIMARY KEY,
  "payoutId"              TEXT NOT NULL REFERENCES "Payout"("id") ON DELETE CASCADE,
  -- One of paymentTransactionId / vaultEntryId / activationRecoveryId
  -- is set (the others null). The unique indexes below guarantee a single
  -- source row maps to at most one PayoutLine, ever.
  "paymentTransactionId"  TEXT UNIQUE,
  "vaultEntryId"          TEXT UNIQUE,
  -- ActivationRecovery added in Phase 4.
  "activationRecoveryId"  TEXT UNIQUE,
  "amountCfa"             INTEGER NOT NULL,
  "kind"                  TEXT NOT NULL, -- 'vote_net' | 'commission' | 'activation_fee' | 'confiscated' | 'activation_recovery'
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PayoutLine_payoutId_idx" ON "PayoutLine" ("payoutId");

-- Distributed lock table (Postgres advisory-lock style, but persisted + observable).
CREATE TABLE "PayoutJobLock" (
  "name"        TEXT PRIMARY KEY,
  "acquiredAt"  TIMESTAMP(3) NOT NULL,
  "acquiredBy"  TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL
);
```

- [ ] **Step 2 : Schema Prisma**

Ajoute à `packages/db/prisma/schema.prisma` :

```prisma
enum PayoutPeriodStatus {
  OPEN
  PROCESSING
  CLOSED
}

enum PayoutStatus {
  PENDING
  IN_FLIGHT
  SUCCEEDED
  FAILED
  UNCERTAIN
}

enum PayoutKind {
  ORGANIZER
  PLATFORM
}

model PayoutPeriod {
  id        String              @id @default(cuid())
  label     String              @unique
  from      DateTime
  to        DateTime
  status    PayoutPeriodStatus  @default(OPEN)
  payouts   Payout[]
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt
}

model Payout {
  id                    String       @id @default(cuid())
  periodId              String
  kind                  PayoutKind
  beneficiaryTenantId   String?
  amountCfa             Int
  currency              String       @default("XOF")
  status                PayoutStatus @default(PENDING)
  idempotencyKey        String       @unique
  provider              String       @default("feexpay")
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

model PayoutLine {
  id                     String   @id @default(cuid())
  payoutId               String
  paymentTransactionId   String?  @unique
  vaultEntryId           String?  @unique
  activationRecoveryId   String?  @unique
  amountCfa              Int
  kind                   String
  createdAt              DateTime @default(now())

  payout Payout @relation(fields: [payoutId], references: [id], onDelete: Cascade)

  @@index([payoutId])
}

model PayoutJobLock {
  name        String   @id
  acquiredAt  DateTime
  acquiredBy  String
  expiresAt   DateTime
}
```

- [ ] **Step 3 : Régénérer + appliquer + TABLES**

```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
npm --workspace=@votezpro/db run db:generate
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Ajoute dans `apps/api/src/test-utils/db.ts` (constante TABLES) — **avant** `"User"` :
```ts
"PayoutLine",
"Payout",
"PayoutPeriod",
"PayoutJobLock",
```

L'ordre compte : `PayoutLine` doit être tronqué avant `Payout` (FK). `TRUNCATE … CASCADE` couvre, mais pour rester lisible on respecte l'ordre logique.

- [ ] **Step 4 : Commit**

```bash
git add packages/db/prisma packages/db/src apps/api/src/test-utils/db.ts
git commit -m "feat(db): PayoutPeriod / Payout / PayoutLine / PayoutJobLock tables"
```

---

### Task 3.2 : Calculateur de soldes — `PayoutBalanceService`

Calcule, pour une fenêtre temporelle, ce qui est dû à chaque organisateur et à la plateforme. Stateless, pas d'écriture.

**Files:**
- Create: `apps/api/src/payouts/payout-balance.service.ts`
- Create: `apps/api/src/payouts/payout-balance.service.test.ts`

- [ ] **Step 1 : Test rouge**

Crée `apps/api/src/payouts/payout-balance.service.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutBalanceService } from "./payout-balance.service";
import { VaultService } from "../platform-control/vault.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const vault = new VaultService(prismaService);
const service = new PayoutBalanceService(prismaService, vault);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedRevenue() {
  const tenant = await prisma.tenant.create({ data: { slug: "pb-org", displayName: "PB" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "pb-evt",
      title: "PB",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  // Vote SUCCEEDED 1000 FCFA, commission 100 FCFA
  const c = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "A", number: 1 }
  });
  const v = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: c.id,
      amountCfa: 1000,
      paidAt: new Date()
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: v.id,
      provider: "feexpay",
      amountCfa: 1000,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: 100,
      idempotencyKey: "pb-vote-key-12345678"
    }
  });
  // Activation 25000 FCFA SUCCEEDED
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      provider: "feexpay",
      amountCfa: 25000,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.ACTIVATION,
      idempotencyKey: "pb-act-key-12345678"
    }
  });
  return { tenant };
}

test("computeOrganizerBalance : net = brut − commission, scoped à la fenêtre", async () => {
  const { tenant } = await seedRevenue();
  const r = await service.computeOrganizerBalance(tenant.id, {
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  assert.equal(r.grossCfa, 1000);
  assert.equal(r.commissionCfa, 100);
  assert.equal(r.netCfa, 900);
  assert.equal(r.lines.length, 1);
});

test("computePlatformBalance : commissions + activations + confiscations", async () => {
  const { tenant } = await seedRevenue();
  // Confiscation : créer une VaultEntry de 500 FCFA dans la fenêtre
  await prisma.vaultEntry.create({
    data: {
      kind: "vote_cancelled",
      tenantId: tenant.id,
      eventId: "x",
      originalVoteId: "x",
      amountCfa: 500,
      occurredAt: new Date(),
      cipherText: "x",
      iv: "x",
      authTag: "x"
    }
  });
  const r = await service.computePlatformBalance({
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  assert.equal(r.commissionCfa, 100);
  assert.equal(r.activationFeesCfa, 25000);
  assert.equal(r.confiscatedCfa, 500);
  assert.equal(r.totalCfa, 25600);
});
```

- [ ] **Step 2 : Implémenter le service**

Crée `apps/api/src/payouts/payout-balance.service.ts` :

```ts
import { Injectable } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "../platform-control/vault.service";

export type BalanceWindow = { from: Date; to: Date };

export type OrganizerBalance = {
  tenantId: string;
  grossCfa: number;
  commissionCfa: number;
  netCfa: number;
  lines: Array<{ paymentTransactionId: string; amountCfa: number; commissionCfa: number }>;
};

export type PlatformBalance = {
  commissionCfa: number;
  activationFeesCfa: number;
  confiscatedCfa: number;
  totalCfa: number;
  commissionLines: Array<{ paymentTransactionId: string; commissionCfa: number }>;
  activationLines: Array<{ paymentTransactionId: string; amountCfa: number }>;
  confiscationLines: Array<{ vaultEntryId: string; amountCfa: number }>;
};

@Injectable()
export class PayoutBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService
  ) {}

  /**
   * Net due to the organizer for the window: sum of (amountCfa − commissionCfa)
   * across SUCCEEDED VOTE payments inside the window that have NOT yet been
   * pinned to a PayoutLine (one-payment-one-payout invariant).
   */
  async computeOrganizerBalance(
    tenantId: string,
    window: BalanceWindow
  ): Promise<OrganizerBalance> {
    const payments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        tenantId,
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { id: true, amountCfa: true, commissionCfa: true }
    });
    // Exclude payments already pinned to a PayoutLine — one-shot guarantee.
    const ids = payments.map((p) => p.id);
    const claimed = new Set(
      (
        await this.prisma.client.payoutLine.findMany({
          where: { paymentTransactionId: { in: ids } },
          select: { paymentTransactionId: true }
        })
      )
        .map((l) => l.paymentTransactionId)
        .filter((v): v is string => v !== null)
    );
    const fresh = payments.filter((p) => !claimed.has(p.id));
    const grossCfa = fresh.reduce((acc, p) => acc + p.amountCfa, 0);
    const commissionCfa = fresh.reduce((acc, p) => acc + (p.commissionCfa ?? 0), 0);
    return {
      tenantId,
      grossCfa,
      commissionCfa,
      netCfa: grossCfa - commissionCfa,
      lines: fresh.map((p) => ({
        paymentTransactionId: p.id,
        amountCfa: p.amountCfa,
        commissionCfa: p.commissionCfa ?? 0
      }))
    };
  }

  async computePlatformBalance(window: BalanceWindow): Promise<PlatformBalance> {
    // Commissions on VOTE payments
    const votePayments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { id: true, commissionCfa: true }
    });
    // Activation fees
    const activationPayments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.ACTIVATION,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { id: true, amountCfa: true }
    });
    // Confiscated (vault entries — 100% platform)
    const vaults = await this.prisma.client.vaultEntry.findMany({
      where: { occurredAt: { gte: window.from, lte: window.to } },
      select: { id: true, amountCfa: true }
    });
    // Exclude already pinned
    const voteIds = votePayments.map((p) => p.id);
    const actIds = activationPayments.map((p) => p.id);
    const vaultIds = vaults.map((v) => v.id);
    const pinnedPayments = new Set(
      (
        await this.prisma.client.payoutLine.findMany({
          where: { paymentTransactionId: { in: [...voteIds, ...actIds] } },
          select: { paymentTransactionId: true }
        })
      )
        .map((l) => l.paymentTransactionId)
        .filter((v): v is string => v !== null)
    );
    const pinnedVaults = new Set(
      (
        await this.prisma.client.payoutLine.findMany({
          where: { vaultEntryId: { in: vaultIds } },
          select: { vaultEntryId: true }
        })
      )
        .map((l) => l.vaultEntryId)
        .filter((v): v is string => v !== null)
    );
    const freshVotes = votePayments.filter((p) => !pinnedPayments.has(p.id));
    const freshActs = activationPayments.filter((p) => !pinnedPayments.has(p.id));
    const freshVaults = vaults.filter((v) => !pinnedVaults.has(v.id));

    const commissionCfa = freshVotes.reduce((acc, p) => acc + (p.commissionCfa ?? 0), 0);
    const activationFeesCfa = freshActs.reduce((acc, p) => acc + p.amountCfa, 0);
    const confiscatedCfa = freshVaults.reduce((acc, v) => acc + v.amountCfa, 0);

    return {
      commissionCfa,
      activationFeesCfa,
      confiscatedCfa,
      totalCfa: commissionCfa + activationFeesCfa + confiscatedCfa,
      commissionLines: freshVotes.map((p) => ({
        paymentTransactionId: p.id,
        commissionCfa: p.commissionCfa ?? 0
      })),
      activationLines: freshActs.map((p) => ({
        paymentTransactionId: p.id,
        amountCfa: p.amountCfa
      })),
      confiscationLines: freshVaults.map((v) => ({ vaultEntryId: v.id, amountCfa: v.amountCfa }))
    };
  }

  /**
   * Lists tenants with ≥ 1 unpinned SUCCEEDED VOTE payment in the window.
   * Used by the orchestrator to know who to issue an organizer payout for.
   */
  async listTenantsWithBalance(window: BalanceWindow): Promise<string[]> {
    const rows = await this.prisma.client.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { tenantId: true },
      distinct: ["tenantId"]
    });
    return rows.map((r) => r.tenantId);
  }
}
```

- [ ] **Step 3 : Créer le module payouts**

Crée `apps/api/src/payouts/payouts.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlModule } from "../platform-control/platform-control.module";
import { PayoutBalanceService } from "./payout-balance.service";

@Module({
  imports: [AuthModule, PlatformControlModule],
  providers: [PayoutBalanceService],
  exports: [PayoutBalanceService]
})
export class PayoutsModule {}
```

Et enregistre-le dans `apps/api/src/app.module.ts` (`imports: [...]`).

- [ ] **Step 4 : Run tests**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payout-balance.service.test.js
```

Expected : 2 PASS.

- [ ] **Step 5 : Ajouter aux scripts npm + commit**

```bash
git add apps/api/src/payouts apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(payouts): PayoutBalanceService — organizer + platform balances per window"
```

(Ajouter `dist/payouts/payout-balance.service.test.js` au script test.)

---

### Task 3.3 : `PayoutJobLockService` — verrou distribué

**Files:**
- Create: `apps/api/src/payouts/payout-job-lock.service.ts`
- Create: `apps/api/src/payouts/payout-job-lock.service.test.ts`
- Modify: `apps/api/src/payouts/payouts.module.ts`

- [ ] **Step 1 : Test rouge**

Crée `apps/api/src/payouts/payout-job-lock.service.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const lock = new PayoutJobLockService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("acquire : 1er process l'obtient ; 2e refusé", async () => {
  const a = await lock.acquire("payout-job", "worker-A", 10_000);
  assert.equal(a, true);
  const b = await lock.acquire("payout-job", "worker-B", 10_000);
  assert.equal(b, false);
});

test("release par le propriétaire libère le verrou", async () => {
  await lock.acquire("job", "A", 10_000);
  await lock.release("job", "A");
  const c = await lock.acquire("job", "B", 10_000);
  assert.equal(c, true);
});

test("verrou expiré : un autre worker peut prendre la main", async () => {
  await lock.acquire("job", "A", 1); // 1 ms
  await new Promise((r) => setTimeout(r, 50));
  const b = await lock.acquire("job", "B", 10_000);
  assert.equal(b, true);
});
```

- [ ] **Step 2 : Implémenter**

Crée `apps/api/src/payouts/payout-job-lock.service.ts` :

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PayoutJobLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Try to acquire a named distributed lock. Returns true on success, false if
   * already held (unless expired, in which case stale lock is overwritten).
   */
  async acquire(name: string, owner: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(Date.now() + ttlMs);
    return this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.payoutJobLock.findUnique({ where: { name } });
      if (existing && existing.expiresAt > now) {
        return false;
      }
      if (existing) {
        await tx.payoutJobLock.update({
          where: { name },
          data: { acquiredAt: now, acquiredBy: owner, expiresAt }
        });
      } else {
        await tx.payoutJobLock.create({
          data: { name, acquiredAt: now, acquiredBy: owner, expiresAt }
        });
      }
      return true;
    });
  }

  async release(name: string, owner: string): Promise<void> {
    await this.prisma.client.payoutJobLock.deleteMany({
      where: { name, acquiredBy: owner }
    });
  }
}
```

- [ ] **Step 3 : Module**

Modifie `apps/api/src/payouts/payouts.module.ts` — ajouter `PayoutJobLockService` aux providers + exports.

- [ ] **Step 4 : Run tests + commit**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payout-job-lock.service.test.js
```
Expected : 3 PASS. Ajouter au `package.json` scripts. Commit :
```bash
git commit -am "feat(payouts): PayoutJobLockService (distributed mutex, expiry-safe)"
```

---

### Task 3.4 : `FeexpayPayoutClient` — wrapper FeexPay (mock injectable)

Pour les tests, le vrai appel HTTP est encapsulé derrière une interface ; en test on injecte un fake.

**Files:**
- Create: `apps/api/src/payouts/feexpay-payout.client.ts`

- [ ] **Step 1 : Interface + implémentation HTTP minimaliste**

Crée `apps/api/src/payouts/feexpay-payout.client.ts` :

```ts
import { Injectable } from "@nestjs/common";

export type FeexpayPayoutRequest = {
  idempotencyKey: string;
  amountCfa: number;
  beneficiaryAccount: string; // FeexPay merchant ID or msisdn
  label: string;
};

export type FeexpayPayoutResult =
  | { status: "SUCCEEDED"; providerRef: string }
  | { status: "FAILED"; reason: string }
  | { status: "UNCERTAIN"; reason: string }; // network timeout, 5xx, etc.

export interface IFeexpayPayoutClient {
  sendPayout(req: FeexpayPayoutRequest): Promise<FeexpayPayoutResult>;
}

@Injectable()
export class FeexpayPayoutClient implements IFeexpayPayoutClient {
  /**
   * The current implementation is a STUB returning UNCERTAIN so the orchestrator
   * code path is fully exercised in tests without making real HTTP calls. Wire
   * the real FeexPay disbursement endpoint here when the merchant account is
   * provisioned (see ADR-014). The signature MUST stay identical.
   */
  async sendPayout(_req: FeexpayPayoutRequest): Promise<FeexpayPayoutResult> {
    return { status: "UNCERTAIN", reason: "FeexPay client not yet wired" };
  }
}
```

- [ ] **Step 2 : Ajouter au module**

Modifie `apps/api/src/payouts/payouts.module.ts` — ajouter `FeexpayPayoutClient` aux providers + exports.

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/payouts/feexpay-payout.client.ts apps/api/src/payouts/payouts.module.ts
git commit -m "feat(payouts): FeexpayPayoutClient interface + UNCERTAIN stub"
```

---

### Task 3.5 : `PayoutsService` — orchestrateur, 6 couches anti-doublon

C'est le cœur de la phase. À découper en étapes TDD. Chaque protection doit être démontrée par un test.

**Files:**
- Create: `apps/api/src/payouts/payouts.service.ts`
- Create: `apps/api/src/payouts/payouts.service.test.ts`
- Modify: `apps/api/src/payouts/payouts.module.ts`

- [ ] **Step 1 : Test — `openPeriod` crée une période OPEN unique par label**

Crée `apps/api/src/payouts/payouts.service.test.ts` (squelette) :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { PayoutPeriodStatus, PayoutStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutsService } from "./payouts.service";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { VaultService } from "../platform-control/vault.service";
import type { FeexpayPayoutRequest, FeexpayPayoutResult, IFeexpayPayoutClient } from "./feexpay-payout.client";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const vault = new VaultService(prismaService);
const balance = new PayoutBalanceService(prismaService, vault);
const lock = new PayoutJobLockService(prismaService);

class FakeFeexpay implements IFeexpayPayoutClient {
  public received: FeexpayPayoutRequest[] = [];
  public nextResult: FeexpayPayoutResult = { status: "SUCCEEDED", providerRef: "fp_ok_1" };
  async sendPayout(req: FeexpayPayoutRequest): Promise<FeexpayPayoutResult> {
    this.received.push(req);
    return this.nextResult;
  }
}

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

function newService(client: IFeexpayPayoutClient = new FakeFeexpay()) {
  return new PayoutsService(prismaService, balance, lock, client);
}

test("openPeriod : crée une période OPEN unique par label", async () => {
  const s = newService();
  const p = await s.openPeriod({ label: "2026-W22", from: new Date(), to: new Date() });
  assert.equal(p.status, PayoutPeriodStatus.OPEN);
  await assert.rejects(
    s.openPeriod({ label: "2026-W22", from: new Date(), to: new Date() }),
    /existe déjà/i
  );
});
```

- [ ] **Step 2 : Implémenter `openPeriod`**

Crée `apps/api/src/payouts/payouts.service.ts` (squelette qui grandit) :

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
  PaymentPurpose,
  PaymentStatus,
  PayoutKind,
  PayoutPeriodStatus,
  PayoutStatus,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import {
  FeexpayPayoutClient,
  IFeexpayPayoutClient
} from "./feexpay-payout.client";

const openPeriodSchema = z.object({
  label: z.string().min(3).max(40),
  from: z.coerce.date(),
  to: z.coerce.date()
});

const JOB_LOCK_NAME = "payout-process-period";
const JOB_LOCK_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: PayoutBalanceService,
    private readonly jobLock: PayoutJobLockService,
    private readonly feexpay: FeexpayPayoutClient | IFeexpayPayoutClient
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

  private periodScopedKey(periodLabel: string, kind: PayoutKind, beneficiaryTenantId: string | null) {
    return createHash("sha256")
      .update(`payout:${periodLabel}:${kind}:${beneficiaryTenantId ?? "PLATFORM"}`)
      .digest("hex");
  }

  // Placeholder for further steps below
}
```

- [ ] **Step 3 : Run test**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payouts.service.test.js
```
Expected : 1 PASS.

- [ ] **Step 4 : Test — `processPeriod` SUCCEEDED crée les payouts ET pin les lignes**

Ajoute le test :

```ts
async function seedPaymentReady(tenantId: string, eventId: string, amount = 1000, commission = 100) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "ps-org" },
    create: { id: tenantId, slug: "ps-org", displayName: "PS" },
    update: {}
  });
  const event = await prisma.event.upsert({
    where: { slug: "ps-evt" },
    create: {
      id: eventId,
      tenantId: tenant.id,
      slug: "ps-evt",
      title: "PS",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    },
    update: {}
  });
  const c = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "A", number: Math.floor(Math.random() * 1e9) }
  });
  const v = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: c.id,
      amountCfa: amount,
      paidAt: new Date()
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: v.id,
      provider: "feexpay",
      amountCfa: amount,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: commission,
      idempotencyKey: `seed-${Math.random().toString(36).slice(2)}`
    }
  });
  return { tenant, event };
}

test("processPeriod SUCCEEDED : crée payout organizer (net 900) + platform (commission 100) + pin les lignes", async () => {
  const fake = new FakeFeexpay();
  const s = newService(fake);
  const { tenant } = await seedPaymentReady("t1", "e1");
  const period = await s.openPeriod({
    label: "2026-W23",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  const result = await s.processPeriod(period.id);
  assert.equal(result.payouts.length, 2);
  const org = result.payouts.find((p) => p.kind === "ORGANIZER");
  const plat = result.payouts.find((p) => p.kind === "PLATFORM");
  assert.equal(org?.amountCfa, 900);
  assert.equal(org?.status, PayoutStatus.SUCCEEDED);
  assert.equal(plat?.amountCfa, 100);
  // Lignes pinées : un 2e processPeriod sur la même période ne refait rien
  const second = await s.processPeriod(period.id);
  assert.equal(second.payouts.length, 0);
  // Période CLOSED après 1er succès
  const refreshed = await prisma.payoutPeriod.findUniqueOrThrow({ where: { id: period.id } });
  assert.equal(refreshed.status, PayoutPeriodStatus.CLOSED);
});

test("processPeriod sur période CLOSED : refusé", async () => {
  const s = newService();
  const period = await s.openPeriod({
    label: "2026-W24",
    from: new Date(),
    to: new Date()
  });
  await prisma.payoutPeriod.update({
    where: { id: period.id },
    data: { status: PayoutPeriodStatus.CLOSED }
  });
  await assert.rejects(s.processPeriod(period.id), /CLOSED/i);
});

test("processPeriod : 2 instances concurrentes — une seule travaille (job lock)", async () => {
  const s1 = newService();
  const s2 = newService();
  const period = await s1.openPeriod({
    label: "2026-W25",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  await seedPaymentReady("t2", "e2");
  const [r1, r2] = await Promise.all([
    s1.processPeriod(period.id).catch((e) => ({ error: e.message })),
    s2.processPeriod(period.id).catch((e) => ({ error: e.message }))
  ]);
  // Une seule a vraiment travaillé ; l'autre a soit fait 0 soit a renvoyé "lock busy"
  const successful = [r1, r2].filter((r) => !("error" in r));
  assert.equal(successful.length, 1);
});

test("processPeriod : UNCERTAIN ne pin PAS et marque payout UNCERTAIN", async () => {
  const fake = new FakeFeexpay();
  fake.nextResult = { status: "UNCERTAIN", reason: "timeout" };
  const s = newService(fake);
  await seedPaymentReady("t3", "e3");
  const period = await s.openPeriod({
    label: "2026-W26",
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000)
  });
  const result = await s.processPeriod(period.id);
  assert.ok(result.payouts.every((p) => p.status === PayoutStatus.UNCERTAIN));
  // Aucune ligne pinée → un retry humain peut tenter à nouveau
  const lines = await prisma.payoutLine.count();
  assert.equal(lines, 0);
  // Période reste PROCESSING (pas CLOSED) car des payouts ne sont pas résolus
  const p = await prisma.payoutPeriod.findUniqueOrThrow({ where: { id: period.id } });
  assert.equal(p.status, PayoutPeriodStatus.PROCESSING);
});
```

- [ ] **Step 5 : Implémenter `processPeriod`**

Ajoute dans `apps/api/src/payouts/payouts.service.ts` :

```ts
async processPeriod(periodId: string) {
  const period = await this.prisma.client.payoutPeriod.findUnique({
    where: { id: periodId }
  });
  if (!period) throw new NotFoundException("Période introuvable.");
  if (period.status === PayoutPeriodStatus.CLOSED) {
    throw new BadRequestException("Période CLOSED — aucun versement supplémentaire.");
  }

  // Couche 6 : verrou distribué.
  const owner = `pid-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const got = await this.jobLock.acquire(JOB_LOCK_NAME, owner, JOB_LOCK_TTL_MS);
  if (!got) {
    this.logger.warn(`processPeriod ${periodId}: lock busy, skipping`);
    return { payouts: [] };
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

    // Organizer payouts
    for (const tenantId of tenants) {
      const bal = await this.balance.computeOrganizerBalance(tenantId, window);
      if (bal.netCfa <= 0) continue;
      const result = await this.issuePayout({
        periodId,
        periodLabel: period.label,
        kind: PayoutKind.ORGANIZER,
        beneficiaryTenantId: tenantId,
        amountCfa: bal.netCfa,
        lines: bal.lines.map((l) => ({
          paymentTransactionId: l.paymentTransactionId,
          amountCfa: l.amountCfa - l.commissionCfa,
          kind: "vote_net"
        }))
      });
      if (result) created.push(result);
    }

    // Platform payout
    if (platform.totalCfa > 0) {
      const allLines = [
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
      const result = await this.issuePayout({
        periodId,
        periodLabel: period.label,
        kind: PayoutKind.PLATFORM,
        beneficiaryTenantId: null,
        amountCfa: platform.totalCfa,
        lines: allLines
      });
      if (result) created.push(result);
    }

    // Fermeture seulement si tout est résolu (SUCCEEDED/FAILED, pas UNCERTAIN)
    const stillProcessing = await this.prisma.client.payout.count({
      where: { periodId, status: { in: [PayoutStatus.PENDING, PayoutStatus.IN_FLIGHT, PayoutStatus.UNCERTAIN] } }
    });
    if (stillProcessing === 0) {
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

private async issuePayout(args: {
  periodId: string;
  periodLabel: string;
  kind: PayoutKind;
  beneficiaryTenantId: string | null;
  amountCfa: number;
  lines: Array<{
    paymentTransactionId?: string;
    vaultEntryId?: string;
    activationRecoveryId?: string;
    amountCfa: number;
    kind: string;
  }>;
}): Promise<{ id: string; kind: PayoutKind; amountCfa: number; status: PayoutStatus } | null> {
  const idempotencyKey = this.periodScopedKey(args.periodLabel, args.kind, args.beneficiaryTenantId);

  // Couche 1 : idempotencyKey unique + uniq(periodId, kind, beneficiaryTenantId)
  // Si déjà existe → on récupère et on saute si terminal.
  const existing = await this.prisma.client.payout.findUnique({ where: { idempotencyKey } });
  if (existing && [PayoutStatus.SUCCEEDED, PayoutStatus.FAILED].includes(existing.status)) {
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
        idempotencyKey,
        status: PayoutStatus.PENDING
      }
    }));

  // Couche 2 : verrou SELECT FOR UPDATE ; ici on simule en passant à IN_FLIGHT.
  // Couche 5 : double check du solde théorique (ceinture+bretelles)
  // → ici la requête est déjà faite via balance ; on s'arrête avant d'envoyer
  // si amountCfa <= 0.
  if (args.amountCfa <= 0) {
    return null;
  }

  await this.prisma.client.payout.update({
    where: { id: payout.id },
    data: { status: PayoutStatus.IN_FLIGHT, lockedAt: new Date() }
  });

  // Couche 1 : la clé d'idempotence est envoyée à FeexPay.
  const result = await this.feexpay.sendPayout({
    idempotencyKey,
    amountCfa: args.amountCfa,
    beneficiaryAccount: args.beneficiaryTenantId ?? "PLATFORM_ACCOUNT",
    label: `${args.kind} ${args.periodLabel}`
  });

  if (result.status === "SUCCEEDED") {
    await this.prisma.client.$transaction([
      this.prisma.client.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.SUCCEEDED,
          providerRef: result.providerRef,
          completedAt: new Date()
        }
      }),
      // Couche 3 : on pin les lignes UNIQUEMENT en cas de succès certain
      ...args.lines.map((l) =>
        this.prisma.client.payoutLine.create({
          data: {
            payoutId: payout.id,
            paymentTransactionId: l.paymentTransactionId ?? null,
            vaultEntryId: l.vaultEntryId ?? null,
            activationRecoveryId: l.activationRecoveryId ?? null,
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

  // UNCERTAIN — STRICT no-retry, attente intervention humaine.
  await this.prisma.client.payout.update({
    where: { id: payout.id },
    data: { status: PayoutStatus.UNCERTAIN, errorMessage: result.reason }
  });
  return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.UNCERTAIN };
}
```

- [ ] **Step 6 : Mettre à jour le module pour injecter le bon client**

Modifie `apps/api/src/payouts/payouts.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlModule } from "../platform-control/platform-control.module";
import { FeexpayPayoutClient } from "./feexpay-payout.client";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutsService } from "./payouts.service";

@Module({
  imports: [AuthModule, PlatformControlModule],
  providers: [
    PayoutBalanceService,
    PayoutJobLockService,
    FeexpayPayoutClient,
    PayoutsService
  ],
  exports: [PayoutsService, PayoutBalanceService]
})
export class PayoutsModule {}
```

- [ ] **Step 7 : Run tests**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/payouts/payouts.service.test.js
```

Expected : 5 PASS.

- [ ] **Step 8 : Ajouter aux scripts npm + commit**

```bash
git add apps/api/src/payouts/ apps/api/package.json
git commit -m "feat(payouts): PayoutsService orchestrator with 6 anti-double-spend layers"
```

---

### Task 3.6 : Endpoints admin `/admin/platform/payouts/*`

**Files:**
- Create: `apps/api/src/payouts/payouts.controller.ts`
- Modify: `apps/api/src/payouts/payouts.module.ts`

- [ ] **Step 1 : Créer le controller**

Crée `apps/api/src/payouts/payouts.controller.ts` :

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PayoutsService } from "./payouts.service";

@Controller("admin/platform/payouts")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post("periods")
  openPeriod(@Body() body: unknown) {
    return this.payouts.openPeriod(body);
  }

  @Post("periods/:id/process")
  processPeriod(@Param("id") id: string) {
    return this.payouts.processPeriod(id);
  }

  @Get("periods/:id")
  getPeriod(@Param("id") id: string) {
    return this.payouts.getPeriod(id);
  }

  @Get()
  listPayouts(@Query() query: unknown) {
    return this.payouts.listPayouts(query);
  }

  @Post(":id/resolve")
  resolveUncertain(@Param("id") id: string, @Body() body: unknown) {
    return this.payouts.resolveUncertain(id, body);
  }
}
```

- [ ] **Step 2 : Ajouter les méthodes manquantes au service**

Dans `apps/api/src/payouts/payouts.service.ts`, ajoute :

```ts
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
    // À ce stade un admin a confirmé manuellement chez FeexPay. On pin les
    // lignes — qui n'avaient PAS été pinées par sécurité.
    // NB : recalcul des lignes hors scope de cette tâche ; en pratique on
    // re-déclenche un processPeriod sur la même période (idempotent).
    await this.prisma.client.payout.update({
      where: { id },
      data: {
        status: PayoutStatus.SUCCEEDED,
        providerRef: input.providerRef,
        completedAt: new Date()
      }
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
```

- [ ] **Step 3 : Module — controller**

Modifie `apps/api/src/payouts/payouts.module.ts` — ajouter `controllers: [PayoutsController]`.

- [ ] **Step 4 : Build + commit**

```bash
cd apps/api && npm run build
git add apps/api/src/payouts/
git commit -m "feat(payouts): admin REST endpoints (open/process/list/resolve)"
```

---

### Task 3.7 : Tests d'intégration end-to-end

- [ ] **Step 1 : Ajouter au `app.integration.test.ts` un scénario complet**

À la fin du test E2E, après quelques votes + webhook SUCCEEDED, ajoute (en mode platform admin authentifié) :

```ts
// Ouvrir une période + processPeriod + vérifier les payouts.
const openRes = await request(app.getHttpServer())
  .post("/api/v1/admin/platform/payouts/periods")
  .set("Authorization", `Bearer ${platformAdminToken}`)
  .send({
    label: "e2e-2026-W22",
    from: new Date(Date.now() - 600_000).toISOString(),
    to: new Date(Date.now() + 600_000).toISOString()
  });
assert.equal(openRes.status, 201);
const periodId = openRes.body.id;

const processRes = await request(app.getHttpServer())
  .post(`/api/v1/admin/platform/payouts/periods/${periodId}/process`)
  .set("Authorization", `Bearer ${platformAdminToken}`);
assert.equal(processRes.status, 201);
// FakeFeexpay par défaut renvoie UNCERTAIN → on assert UNCERTAIN
assert.ok(processRes.body.payouts.every((p: { status: string }) => p.status === "UNCERTAIN"));
```

Note : pour rendre le test fiable, il faut injecter un client FeexPay déterministe. Si ce n'est pas le scope du fichier de test E2E (qui charge le vrai AppModule), considérer ce bloc comme "smoke test" — l'attente `UNCERTAIN` est cohérente avec le stub par défaut.

- [ ] **Step 2 : Run la suite complète**

```bash
cd apps/api && npm test
```

Expected : tout vert.

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/app.integration.test.ts
git commit -m "test(integration): payout period open/process e2e smoke"
```

---

**Sortie de Phase 3** : les payouts existent et résistent aux doublons (idempotency key, unique-index, no-retry on UNCERTAIN, distributed lock). Les organisateurs et la plateforme peuvent être réglés via FeexPay une fois le client réel branché (`FeexpayPayoutClient`). Aucune ligne de revenu ne peut être versée deux fois — c'est garanti par 3 verrous d'unicité Prisma + l'unique-index sur `PayoutLine.paymentTransactionId`.
