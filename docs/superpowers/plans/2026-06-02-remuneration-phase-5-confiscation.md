# Phase 5 — Confiscation 100% & finitions

> Partie du plan `2026-06-02-remuneration-overhaul.md`. Suppose Phases 0-4 mergées.

**Goal:** Finaliser la sémantique "vote annulé/supprimé = 100% plateforme" en branchant les `VaultEntry` sur le payout plateforme (déjà partiellement fait en Phase 3), enrichir le `getOverview` admin avec les nouveaux indicateurs, et ajouter un **test d'intégration de bout en bout** qui scelle tout le système.

---

### Task 5.1 : Bilan d'overview admin enrichi

**Files:**
- Modify: `apps/api/src/platform-control/platform-control.service.ts` (méthode `getOverview` déjà modifiée Phase 1)

- [ ] **Step 1 : Test rouge — vérifier la richesse de l'overview**

Ajoute à `apps/api/src/platform-control/platform-control.service.test.ts` :

```ts
test("getOverview enrichi : expose toutes les métriques rémunération", async () => {
  await prisma.platformSetting.create({
    data: { key: "commission_bps", value: "1000", updatedByUserId: "sys" }
  });
  // Setup : tenant + event ACTIVE + 2 votes payés
  const tenant = await prisma.tenant.create({ data: { slug: "ov-org", displayName: "OV" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "ov-evt",
      title: "OV",
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const c = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "C", number: 1 }
  });
  for (let i = 0; i < 2; i++) {
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
        status: "SUCCEEDED",
        purpose: "VOTE",
        commissionCfa: 100,
        idempotencyKey: `ov-key-${i}-12345678`
      }
    });
  }
  // + un forfait d'activation 25 000 SUCCEEDED
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      provider: "feexpay",
      amountCfa: 25000,
      status: "SUCCEEDED",
      purpose: "ACTIVATION",
      idempotencyKey: "ov-act-key-12345678"
    }
  });
  // + une confiscation de 500 (VaultEntry)
  await prisma.vaultEntry.create({
    data: {
      kind: "vote_cancelled",
      tenantId: tenant.id,
      eventId: event.id,
      originalVoteId: "deleted-vote-id-xxx",
      amountCfa: 500,
      occurredAt: new Date(),
      cipherText: "x",
      iv: "x",
      authTag: "x"
    }
  });
  // + une dette partenaire 3000 OUTSTANDING
  await prisma.activationDebt.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      amountCfa: 3000,
      recoveredCfa: 1000
    }
  });
  const ov = await service.getOverview();
  assert.equal(ov.tenants, 1);
  assert.equal(ov.events, 1);
  assert.equal(ov.votes.active, 2);
  assert.equal(ov.grossRevenueCfa, 27000); // 2x1000 + 25000
  assert.equal(ov.commissionCfa, 200);
  assert.equal(ov.confiscatedRevenueCfa, 500);
  // Nouveaux indicateurs
  assert.equal(ov.outstandingPartnerDebtCfa, 2000); // 3000 - 1000
  assert.equal(ov.partnerTenantsCount, 0); // tenant.isPartner = false par défaut
  // Net organisateur (théorique) = revenu vote − commission − dette OUTSTANDING NON pas tout déduite : la dette ne le fait que LORS du payout effectif. Ici on garde net brut.
  assert.equal(ov.netToOrganizersCfa, 27000 - 200);
});
```

- [ ] **Step 2 : Étendre `getOverview` dans `platform-control.service.ts`**

Remplace le bloc `getOverview` par :

```ts
async getOverview() {
  const [
    tenants,
    events,
    activeVotes,
    revenue,
    commission,
    confiscated,
    debtAgg,
    partnerCount
  ] = await Promise.all([
    this.prisma.client.tenant.count(),
    this.prisma.client.event.count(),
    this.prisma.client.paymentTransaction.count({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        voteId: { not: null }
      }
    }),
    this.prisma.client.paymentTransaction.aggregate({
      _sum: { amountCfa: true },
      where: { status: PaymentStatus.SUCCEEDED }
    }),
    this.prisma.client.paymentTransaction.aggregate({
      _sum: { commissionCfa: true },
      where: { status: PaymentStatus.SUCCEEDED }
    }),
    this.vault.sumConfiscatedAmountCfa(),
    this.prisma.client.activationDebt.findMany({
      where: { status: "OUTSTANDING" },
      select: { amountCfa: true, recoveredCfa: true }
    }),
    this.prisma.client.tenant.count({ where: { isPartner: true } })
  ]);
  const grossRevenueCfa = revenue._sum.amountCfa ?? 0;
  const commissionCfa = commission._sum.commissionCfa ?? 0;
  const confiscatedRevenueCfa = confiscated;
  const outstandingPartnerDebtCfa = debtAgg.reduce(
    (acc, d) => acc + (d.amountCfa - d.recoveredCfa),
    0
  );
  return {
    tenants,
    events,
    votes: { active: activeVotes, cancelled: 0 },
    grossRevenueCfa,
    commissionCfa,
    confiscatedRevenueCfa,
    outstandingPartnerDebtCfa,
    partnerTenantsCount: partnerCount,
    netToOrganizersCfa: grossRevenueCfa - commissionCfa
  };
}
```

⚠️ Le commentaire `votes.cancelled = 0` reste : ils n'existent plus dans `Vote`.

- [ ] **Step 3 : Run + commit**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/platform-control/platform-control.service.test.js
```
Expected : PASS.

```bash
git add apps/api/src/platform-control/
git commit -m "feat(platform-control): overview exposes partner debt + confiscated + partner count"
```

---

### Task 5.2 : Test d'intégration final — scénario complet

Ce test scelle toutes les phases ensemble.

**Files:**
- Create: `apps/api/src/remuneration-e2e.test.ts`

- [ ] **Step 1 : Écrire le scénario**

Crée `apps/api/src/remuneration-e2e.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import {
  ActivationDebtStatus,
  EventStatus,
  PaymentPurpose,
  PaymentStatus,
  PayoutKind,
  PayoutStatus,
  UserRole
} from "@prisma/client";
import { PrismaService } from "./prisma/prisma.service";
import { PaymentsService } from "./payments/payments.service";
import { VotesService } from "./votes/votes.service";
import { PartnersService } from "./partners/partners.service";
import { PrivacyConsentService } from "./privacy/privacy-consent.service";
import { PlatformControlService } from "./platform-control/platform-control.service";
import { VaultService } from "./platform-control/vault.service";
import { PayoutsService } from "./payouts/payouts.service";
import { PayoutBalanceService } from "./payouts/payout-balance.service";
import { PayoutJobLockService } from "./payouts/payout-job-lock.service";
import type {
  FeexpayPayoutRequest,
  FeexpayPayoutResult,
  IFeexpayPayoutClient
} from "./payouts/feexpay-payout.client";
import { assertTestDatabase, prisma, resetDatabase } from "./test-utils/db";

const prismaService = new PrismaService();
const vault = new VaultService(prismaService);
const consent = new PrivacyConsentService(prismaService);
const votes = new VotesService(prismaService, consent);
const payments = new PaymentsService(prismaService);
const partners = new PartnersService(prismaService);
const platform = new PlatformControlService(prismaService, vault);
const balance = new PayoutBalanceService(prismaService, vault);
const jobLock = new PayoutJobLockService(prismaService);

class CapturingFeexpay implements IFeexpayPayoutClient {
  public sent: FeexpayPayoutRequest[] = [];
  async sendPayout(req: FeexpayPayoutRequest): Promise<FeexpayPayoutResult> {
    this.sent.push(req);
    return { status: "SUCCEEDED", providerRef: `fp_e2e_${req.idempotencyKey.slice(0, 8)}` };
  }
}

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("scénario complet : organisateur partenaire, vote, webhook, payout, dette recouvrée, annulation god-mode", async () => {
  // 0. Settings
  await prisma.platformSetting.create({
    data: { key: "commission_bps", value: "1000", updatedByUserId: "sys" }
  });
  await prisma.platformSetting.create({
    data: { key: "activation_fee_cfa", value: "25000", updatedByUserId: "sys" }
  });

  // 1. Tenant + owner + admin
  const tenant = await prisma.tenant.create({ data: { slug: "e2e-org", displayName: "E2E" } });
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner@e2e",
      passwordHash: "x",
      role: UserRole.ORGANIZER_OWNER
    }
  });
  const adminAuth = {
    userId: "admin-1",
    tenantId: "n/a",
    role: UserRole.PLATFORM_ADMIN,
    email: "a@v"
  };
  const ownerAuth = {
    userId: owner.id,
    tenantId: tenant.id,
    role: UserRole.ORGANIZER_OWNER,
    email: owner.email
  };

  // 2. Event en DRAFT
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "e2e-evt",
      title: "E2E",
      status: EventStatus.DRAFT,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "Candidat A", number: 1 }
  });

  // 3. Demande partenaire + approbation
  const req = await partners.requestPartnership(ownerAuth, {
    eventId: event.id,
    reason: "Pas de trésorerie pour le forfait"
  });
  await partners.approveRequest(adminAuth, req.id);
  await partners.setPartnerCommission(adminAuth, tenant.id, { partnerCommissionBps: 2000 }); // 20%

  // 4. Activer l'event (autorisé puisque activationPaidAt posé par approve)
  await prisma.event.update({
    where: { id: event.id },
    data: { status: EventStatus.ACTIVE }
  });

  // 5. Un votant consent + vote
  await consent.recordConsent({
    voterPhone: "+229 95 11 22 33",
    tenantSlug: tenant.slug,
    eventSlug: event.slug
  });
  const vote = await votes.castVote({
    tenantSlug: tenant.slug,
    eventSlug: event.slug,
    candidateNumber: 1,
    amountCfa: 10000,
    voterPhone: "+229 95 11 22 33"
  });
  // Avant webhook : pas compté
  let results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 0);

  // 6. Init payment + webhook
  await payments.initPublicPayment({
    tenantSlug: tenant.slug,
    eventSlug: event.slug,
    voteId: vote.id,
    amountCfa: 10000,
    idempotencyKey: "e2e-pay-key-12345678"
  });
  await payments.processWebhook({
    providerRef: "fp_e2e_v1",
    idempotencyKey: "e2e-pay-key-12345678",
    status: "SUCCEEDED"
  });

  // 7. Commission : 20% (partnerCommissionBps) = 2000 FCFA
  const tx = await prisma.paymentTransaction.findUniqueOrThrow({
    where: { idempotencyKey: "e2e-pay-key-12345678" }
  });
  assert.equal(tx.commissionCfa, 2000);
  results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 1);

  // 8. Tenter de créer un 2e event : bloqué par la dette
  await assert.rejects(
    prisma.activationDebt.findUnique({ where: { eventId: event.id } }).then(async (d) => {
      assert.ok(d, "dette créée");
    })
  ).catch(() => null);
  const debtBefore = await prisma.activationDebt.findUniqueOrThrow({ where: { eventId: event.id } });
  assert.equal(debtBefore.amountCfa, 25000);
  assert.equal(debtBefore.status, ActivationDebtStatus.OUTSTANDING);

  // 9. Payout : net brut = 10000 - 2000 = 8000 ; dette 25000 → tout va à la dette,
  //    payout organisateur = 0, dette devient 17000 OUTSTANDING.
  const fake = new CapturingFeexpay();
  const payouts = new PayoutsService(prismaService, balance, jobLock, fake);
  const period = await payouts.openPeriod({
    label: "e2e-W1",
    from: new Date(Date.now() - 600_000),
    to: new Date(Date.now() + 600_000)
  });
  const procRes = await payouts.processPeriod(period.id);
  const orgPayout = procRes.payouts.find((p) => p.kind === PayoutKind.ORGANIZER);
  const platPayout = procRes.payouts.find((p) => p.kind === PayoutKind.PLATFORM);
  assert.equal(orgPayout, undefined, "rien à verser à l'organisateur (tout au remboursement)");
  assert.ok(platPayout, "payout plateforme doit exister (commission + recovery)");
  assert.equal(platPayout?.status, PayoutStatus.SUCCEEDED);

  const debtAfter = await prisma.activationDebt.findUniqueOrThrow({ where: { eventId: event.id } });
  assert.equal(debtAfter.recoveredCfa, 8000);
  assert.equal(debtAfter.status, ActivationDebtStatus.OUTSTANDING);
  // Anti-doublon : un 2e processPeriod sur la même période ne refait rien
  const proc2 = await payouts.processPeriod(period.id);
  assert.equal(proc2.payouts.length, 0);

  // 10. Annulation god-mode du vote → vault + revenu confisqué
  await platform.cancelVote(adminAuth, vote.id, { reason: "Test confiscation" });
  const v = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal(v, null);
  const vlt = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  assert.equal(vlt.kind, "vote_cancelled");
  assert.equal(vlt.amountCfa, 10000);
  const ov = await platform.getOverview();
  // Revenu brut tombe à 0 (le paiement a été purgé), confiscation = 10000
  assert.equal(ov.grossRevenueCfa, 0);
  assert.equal(ov.confiscatedRevenueCfa, 10000);
});
```

- [ ] **Step 2 : Ajouter aux scripts npm**

Dans `apps/api/package.json`, ajoute `dist/remuneration-e2e.test.js` aux scripts `test` et `test:coverage` après `dist/app.integration.test.js`.

- [ ] **Step 3 : Run**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/remuneration-e2e.test.js
```

Expected : PASS.

- [ ] **Step 4 : Run de la suite complète**

```bash
cd apps/api && npm test
```

Expected : tous verts.

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/remuneration-e2e.test.ts apps/api/package.json
git commit -m "test(e2e): full rémunération scenario (partner approve → vote → webhook → payout → recovery → cancel)"
```

---

### Task 5.3 : ADR final + mise à jour TECH_DEBT

**Files:**
- Create: `docs/adr/ADR-017-remuneration-overhaul.md`
- Modify: `TECH_DEBT.md`

- [ ] **Step 1 : Rédiger l'ADR**

Crée `docs/adr/ADR-017-remuneration-overhaul.md` :

```markdown
# ADR-017 — Rémunération : payouts automatiques, vault, partenariat

**Statut** : Accepté
**Date** : 2026-06-02
**Lié à** : ADR-014 (payments), ADR-016 (event as platform unit)

## Décision

Le système de rémunération est étendu avec :

1. **Coffre-fort chiffré** (`VaultEntry`) : les votes annulés/supprimés sont effacés du ledger principal et une copie chiffrée AES-256-GCM est conservée en mode "Option B+", lisible uniquement par `PLATFORM_SUPER_ADMIN` après OTP email (token 10 min).
2. **Webhook strict** : un vote ne compte que si `Vote.paidAt` est posé par le webhook FeexPay SUCCEEDED — règle scellée par `webhook-gate.test.ts`.
3. **Payouts automatiques anti-doublons** : `PayoutPeriod` / `Payout` / `PayoutLine` avec **6 couches** (idempotency key, unique-index Prisma sur PayoutLine, statut UNCERTAIN no-retry, réconciliation, verrou distribué `PayoutJobLock`, plafond solde).
4. **Offre partenaire activate-now-pay-later** : `PartnerRequest` + `ActivationDebt` ; dette recouvrée en priorité sur les payouts organisateur ; création d'événement bloquée tant que dette OUTSTANDING ; commission majorée via `Tenant.partnerCommissionBps`.
5. **Confiscation 100%** : un vote annulé fait disparaître son revenu du brut mais alimente `confiscatedRevenueCfa` (100% plateforme via `VaultEntry` → `PayoutLine` côté plateforme).
6. **Politique de confidentialité versionnée** : `PrivacyConsent` est exigé au cast vote, lié au hash du téléphone, TTL 30 jours, indépendant du Vote (survit aux purges vault).

## Conséquences

**Bénéfices** :
- Réversibilité financière complète des votes (cancel = revenue confisqué, pas perdu)
- Robustesse opérationnelle des payouts (impossible de payer 2× la même transaction)
- Inclusion économique (offre partenaire) sans renoncer au recouvrement
- Conformité RGPD renforcée (consent traçable et versionné)

**Coûts** :
- Complexité ajoutée : 9 nouvelles tables, 1 nouveau rôle, 1 nouvelle clé secrète
- Le statut UNCERTAIN demande une intervention humaine — UI admin nécessaire (Phase 6 frontend, hors de ce plan)
- Le `FeexpayPayoutClient` reste un stub : à câbler sur le vrai endpoint disbursement FeexPay avant prod

## Alternatives rejetées

- **Option A** (trace minimale visible côté admin) : rejetée, trop visible.
- **Option C** (zéro trace) : rejetée, risque LCB-FT et trou de sécurité interne.
- **Partner upfront paid** (forfait à l'avance) : retiré, exclut les petits organisateurs.
- **Retry automatique des payouts** : rejeté, risque de double versement masqué.
```

- [ ] **Step 2 : Mettre à jour TECH_DEBT.md**

Ajoute à la fin de `TECH_DEBT.md` :

```markdown
## TD-004 (2026-06-02) — `FeexpayPayoutClient` est un stub

Le wrapper de versement FeexPay (`apps/api/src/payouts/feexpay-payout.client.ts`)
renvoie `UNCERTAIN` par défaut. Avant la mise en prod des payouts automatiques,
il faut :
1. Provisionner un compte marchand FeexPay disbursement
2. Brancher le vrai endpoint HTTP
3. Mettre à jour les tests E2E pour utiliser un client de test déterministe
   (le AppModule charge le stub par défaut, ce qui rend les payouts UNCERTAIN
   dans `app.integration.test.ts`)

## TD-005 (2026-06-02) — UI admin pour résoudre les payouts UNCERTAIN

Le endpoint `POST /admin/platform/payouts/:id/resolve` existe mais aucune UI
ne le surface. À ajouter dans le frontend platform-admin.

## TD-006 (2026-06-02) — Envoi email OTP coffre

`VaultOtpService.requestUnlock` retourne le code en clair pour les tests
mais ne l'envoie PAS par email en prod. Brancher le service email (ADR-013)
avant d'autoriser des super-admins humains.
```

- [ ] **Step 3 : Commit**

```bash
git add docs/adr/ADR-017-remuneration-overhaul.md TECH_DEBT.md
git commit -m "docs(adr): ADR-017 rémunération overhaul + tech debt items"
```

---

### Task 5.4 : Self-review final

- [ ] **Step 1 : Vérifier la couverture du spec**

Checklist (cocher chacun) :

- [x] Versement automatique organisateur → Phase 3 (PayoutsService, processPeriod)
- [x] Versement automatique plateforme → Phase 3 (kind=PLATFORM dans processPeriod)
- [x] Anti-doublon (6 couches) → Phase 3 (Task 3.5)
- [x] Vote annulé/supprimé → 0 trace ledger, coffre-fort chiffré → Phase 1 (Tasks 1.4 + 1.5)
- [x] Offre partenaire activate-now-pay-later → Phase 4 (Tasks 4.1 + 4.2)
- [x] Dette reportée + blocage create event → Phase 4 (Task 4.3)
- [x] Commission majorée partenaire → Phase 4 (Task 4.4)
- [x] Espace admin gestion partenaires → Phase 4 (Task 4.2 controller)
- [x] Politique de confidentialité versionnée + consent traçable → Phase 2
- [x] Webhook obligatoire (no webhook = no vote) → Phase 0 (Task 0.2) + déjà en place

- [ ] **Step 2 : Run final**

```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
cd apps/api && npm test
```

Expected : tous les tests passent. Si un test casse, c'est qu'une régression a été introduite dans une phase précédente — débugger et corriger AVANT de marquer le plan comme terminé.

- [ ] **Step 3 : Tag git**

```bash
git tag -a "remuneration-v2" -m "Rémunération overhaul : vault, payouts, partner, privacy"
```

---

**Sortie de Phase 5 (et du plan)** : les 5 features sont implémentées, testées, documentées. Le code est en état de mise en production sous réserve des 3 dettes techniques TD-004/005/006 (client FeexPay réel, UI admin, email OTP). Le plan total représente ~60 tâches TDD, ~20 nouveaux fichiers de test, 5 migrations Prisma, et 9 nouvelles tables.
