# Phase 0 — Préparation & règle webhook stricte

> Partie du plan `2026-06-02-remuneration-overhaul.md`. Exécute Phase 0 entièrement avant de passer à Phase 1.

**Goal:** Préparer le terrain — ajouter le rôle `PLATFORM_SUPER_ADMIN`, formaliser par un test la règle "no webhook = no vote counted", et créer un helper de cohérence ledger réutilisable par les phases suivantes.

---

### Task 0.1 : Ajouter le rôle `PLATFORM_SUPER_ADMIN`

**Files:**
- Modify: `packages/db/prisma/schema.prisma:10-14`
- Create: `packages/db/prisma/migrations/20260602080000_add_super_admin_role/migration.sql`
- Modify: `apps/api/src/test-utils/db.ts` (rien à changer ici — `User.role` est un enum, pas une table)

- [ ] **Step 1 : Écrire la nouvelle migration**

Crée `packages/db/prisma/migrations/20260602080000_add_super_admin_role/migration.sql` :

```sql
-- Adds the PLATFORM_SUPER_ADMIN role, a tier above PLATFORM_ADMIN. Reserved
-- to operations that even the regular platform admin must not perform
-- (e.g. read the deleted-votes vault). Postgres requires ALTER TYPE outside
-- a transaction block; Prisma runs each migration.sql as its own statement.
ALTER TYPE "UserRole" ADD VALUE 'PLATFORM_SUPER_ADMIN';
```

- [ ] **Step 2 : Mettre à jour le schema Prisma**

Modifie `packages/db/prisma/schema.prisma` lignes 10-14 :

```prisma
enum UserRole {
  PLATFORM_SUPER_ADMIN
  PLATFORM_ADMIN
  ORGANIZER_OWNER
  ORGANIZER_STAFF
}
```

- [ ] **Step 3 : Régénérer le client Prisma + appliquer la migration sur la base de test**

Run :
```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
npm --workspace=@votezpro/db run db:generate
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Expected : "1 migration applied" + le client TS connaît `UserRole.PLATFORM_SUPER_ADMIN`.

- [ ] **Step 4 : Écrire un test minimal qui vérifie l'existence du rôle dans le client**

Crée `apps/api/src/auth/super-admin-role.test.ts` :

```ts
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";

test("UserRole expose PLATFORM_SUPER_ADMIN", () => {
  assert.equal(UserRole.PLATFORM_SUPER_ADMIN, "PLATFORM_SUPER_ADMIN");
});
```

- [ ] **Step 5 : Ajouter le test aux scripts npm**

Modifie `apps/api/package.json` — dans le script `test`, ajoute `dist/auth/super-admin-role.test.js` à la liste après `dist/auth/guards.test.js`. Idem dans `test:coverage`.

- [ ] **Step 6 : Build + run du test**

Run :
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/auth/super-admin-role.test.js
```

Expected : PASS.

- [ ] **Step 7 : Commit**

```bash
git add packages/db/prisma packages/db/src apps/api/src/auth/super-admin-role.test.ts apps/api/package.json
git commit -m "feat(auth): add PLATFORM_SUPER_ADMIN role"
```

---

### Task 0.2 : Test formalisant la règle "no webhook = no vote counted"

La règle existe déjà dans le code (`Vote.paidAt` posé seulement par `processWebhook`), mais elle n'a pas de test dédié qui dit "un vote sans webhook ne peut PAS apparaître dans les résultats publics, sous AUCUNE condition". On le rend explicite.

**Files:**
- Create: `apps/api/src/votes/webhook-gate.test.ts`

- [ ] **Step 1 : Écrire le test rouge**

Crée `apps/api/src/votes/webhook-gate.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VotesService } from "./votes.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

// Verrouille la règle d'or de la plateforme : AUCUN vote ne doit jamais
// apparaître dans les résultats publics tant que le webhook FeexPay n'a pas
// posé `paidAt`. Même un PaymentTransaction SUCCEEDED mais sans paidAt sur
// la ligne Vote ne doit PAS être compté.
const prismaService = new PrismaService();
const votes = new VotesService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedEventWithCandidate() {
  const tenant = await prisma.tenant.create({
    data: { slug: "gate-org", displayName: "Gate Org" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "gate-event",
      title: "Gate event",
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "Cand A", number: 1 }
  });
  return { tenant, event, candidate };
}

test("vote sans paidAt : 0 dans le tally", async () => {
  const { tenant, event, candidate } = await seedEventWithCandidate();
  await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500
    }
  });
  const results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 0);
  assert.equal(results.totals.amountCfa, 0);
});

test("vote avec paidAt : compté ; vote dont SEUL PaymentTransaction est SUCCEEDED mais paidAt null : PAS compté", async () => {
  const { tenant, event, candidate } = await seedEventWithCandidate();

  // Vote A : webhook a bien posé paidAt → doit compter
  const voteA = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });

  // Vote B : paiement SUCCEEDED mais paidAt n'a pas été stampé (bug
  // hypothétique, désync, etc.) → NE doit PAS compter, la source de vérité
  // est `Vote.paidAt`, jamais la jointure.
  const voteB = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: voteB.id,
      provider: "feexpay",
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "no-paidat-test-key-1234567"
    }
  });

  const results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 1, "seul Vote A doit compter");
  assert.equal(results.totals.amountCfa, 500);

  // Sanity check : Vote A est bien identifié comme le compté
  const rA = results.results.find((r) => r.candidateId === candidate.id);
  assert.equal(rA?.voteCount, 1);
});

test("vote avec paidAt mais cancelledAt non null : PAS compté", async () => {
  const { tenant, event, candidate } = await seedEventWithCandidate();
  await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date(),
      cancelledAt: new Date(),
      cancelledReason: "test"
    }
  });
  const results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 0);
});
```

- [ ] **Step 2 : Build + run, vérifier qu'il passe (le code actuel respecte déjà la règle)**

Run :
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npm run test:db:prepare && \
  node --test dist/votes/webhook-gate.test.js
```

Expected : 3 tests PASS.

Si un test échoue, c'est qu'une régression existe dans `VotesService.computeResults` — corriger avant de continuer.

- [ ] **Step 3 : Ajouter le test aux scripts npm**

Dans `apps/api/package.json`, ajoute `dist/votes/webhook-gate.test.js` aux scripts `test` et `test:coverage` après `dist/votes/votes.service.test.js`.

- [ ] **Step 4 : Commit**

```bash
git add apps/api/src/votes/webhook-gate.test.ts apps/api/package.json
git commit -m "test(votes): lock webhook-gate rule (no paidAt = not counted, ever)"
```

---

### Task 0.3 : Helper `scanLedgerConsistency` réutilisable

On crée un service interne qui détecte les incohérences ledger ↔ votes. Il sera utilisé par la phase 3 (réconciliation des payouts) et par un futur endpoint de monitoring.

**Files:**
- Create: `apps/api/src/observability/ledger-consistency.service.ts`
- Create: `apps/api/src/observability/ledger-consistency.service.test.ts`
- Modify: `apps/api/src/observability/observability.module.ts`

- [ ] **Step 1 : Écrire le test rouge**

Crée `apps/api/src/observability/ledger-consistency.service.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerConsistencyService } from "./ledger-consistency.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const ledger = new LedgerConsistencyService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function baseEvent() {
  const tenant = await prisma.tenant.create({ data: { slug: "led-org", displayName: "Led" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "led-evt",
      title: "led",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "A", number: 1 }
  });
  return { tenant, event, candidate };
}

test("base saine : 0 incohérence", async () => {
  const { tenant, event, candidate } = await baseEvent();
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: "feexpay",
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: 50,
      idempotencyKey: "consistent-key-12345678"
    }
  });
  const report = await ledger.scan();
  assert.equal(report.votesPaidWithoutSucceededPayment.length, 0);
  assert.equal(report.succeededPaymentsWithoutPaidVote.length, 0);
});

test("incohérence : Vote.paidAt posé mais PaymentTransaction n'est pas SUCCEEDED", async () => {
  const { tenant, event, candidate } = await baseEvent();
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: "feexpay",
      amountCfa: 500,
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "inconsistent-key-1234567"
    }
  });
  const report = await ledger.scan();
  assert.equal(report.votesPaidWithoutSucceededPayment.length, 1);
  assert.equal(report.votesPaidWithoutSucceededPayment[0]?.voteId, vote.id);
});

test("incohérence : PaymentTransaction SUCCEEDED VOTE mais Vote.paidAt null", async () => {
  const { tenant, event, candidate } = await baseEvent();
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: "feexpay",
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "missing-paidat-key-12345"
    }
  });
  const report = await ledger.scan();
  assert.equal(report.succeededPaymentsWithoutPaidVote.length, 1);
  assert.equal(report.succeededPaymentsWithoutPaidVote[0]?.voteId, vote.id);
});
```

Run :
```bash
cd apps/api && npm run build
```
Expected : ÉCHEC de build car `LedgerConsistencyService` n'existe pas encore.

- [ ] **Step 2 : Implémenter le service**

Crée `apps/api/src/observability/ledger-consistency.service.ts` :

```ts
import { Injectable } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type LedgerInconsistency = {
  voteId: string;
  paymentId: string | null;
  reason: string;
};

export type LedgerReport = {
  votesPaidWithoutSucceededPayment: LedgerInconsistency[];
  succeededPaymentsWithoutPaidVote: LedgerInconsistency[];
};

/**
 * Detects ledger ↔ vote drift. Used by the payouts reconciliation job (Phase 3)
 * and surfaced on demand to platform admins. Cheap enough to run inline (two
 * indexed scans), but kept stateless: it reports, it does not mutate.
 */
@Injectable()
export class LedgerConsistencyService {
  constructor(private readonly prisma: PrismaService) {}

  async scan(): Promise<LedgerReport> {
    // Votes with paidAt set but no SUCCEEDED VOTE payment behind them.
    const paidVotes = await this.prisma.client.vote.findMany({
      where: { paidAt: { not: null }, cancelledAt: null },
      select: { id: true }
    });
    const paidPayments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        purpose: PaymentPurpose.VOTE,
        status: PaymentStatus.SUCCEEDED,
        voteId: { not: null }
      },
      select: { id: true, voteId: true }
    });
    const paidPaymentVoteIds = new Set(
      paidPayments.map((p) => p.voteId).filter((v): v is string => v !== null)
    );
    const votesPaidWithoutSucceededPayment = paidVotes
      .filter((v) => !paidPaymentVoteIds.has(v.id))
      .map<LedgerInconsistency>((v) => ({
        voteId: v.id,
        paymentId: null,
        reason: "Vote.paidAt set but no SUCCEEDED VOTE PaymentTransaction"
      }));

    // SUCCEEDED VOTE payments whose Vote has no paidAt (or is cancelled).
    const paidVoteIds = new Set(paidVotes.map((v) => v.id));
    const succeededPaymentsWithoutPaidVote = paidPayments
      .filter((p) => p.voteId !== null && !paidVoteIds.has(p.voteId))
      .map<LedgerInconsistency>((p) => ({
        voteId: p.voteId as string,
        paymentId: p.id,
        reason: "SUCCEEDED VOTE PaymentTransaction but Vote.paidAt missing or vote cancelled"
      }));

    return { votesPaidWithoutSucceededPayment, succeededPaymentsWithoutPaidVote };
  }
}
```

- [ ] **Step 3 : Enregistrer le service dans le module observability**

Modifie `apps/api/src/observability/observability.module.ts` — ajoute `LedgerConsistencyService` aux `providers` et aux `exports`. (Lire le fichier d'abord pour reproduire le style exact.)

- [ ] **Step 4 : Run tests**

Run :
```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/observability/ledger-consistency.service.test.js
```

Expected : 3 tests PASS.

- [ ] **Step 5 : Ajouter le test aux scripts npm**

Dans `apps/api/package.json`, ajoute `dist/observability/ledger-consistency.service.test.js` aux scripts `test` et `test:coverage` après `dist/observability/observability.service.test.js`.

- [ ] **Step 6 : Commit**

```bash
git add apps/api/src/observability/ledger-consistency.service.ts \
        apps/api/src/observability/ledger-consistency.service.test.ts \
        apps/api/src/observability/observability.module.ts \
        apps/api/package.json
git commit -m "feat(observability): ledger ↔ vote consistency scanner"
```

---

### Task 0.4 : Vérifier que toute la suite passe

- [ ] **Step 1 : Run de la suite complète**

```bash
cd apps/api && npm test
```

Expected : tous les tests existants + les 4 nouveaux passent.

- [ ] **Step 2 : Si tout est vert, fin de Phase 0. Sinon, débugger.**

---

**Sortie de Phase 0** : code identique fonctionnellement à avant, plus un rôle non-utilisé, un test qui scelle la règle webhook, et un helper de cohérence prêt à servir. Aucune table métier ajoutée. Tu peux merger Phase 0 indépendamment.
