# F2 — Ledger Settlement (commission override + held/withdrawable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le solde `pending`/`available` unique par un portefeuille `held`/`withdrawable`, brancher la résolution de commission par vote sur la chaîne d'override (event → tenant → plateforme) pour l'offre Escrow, et libérer le held 48h après clôture au lieu de tout de suite.

**Architecture:** Renommage des colonnes `OrganizerWallet` (migration Prisma), extension de `WalletService` avec une méthode de split held/withdrawable, ajout d'un champ `Event.heldBps` figé à l'activation (miroir de `commissionBps`, déjà existant), nouvelle résolution de commission dans `OfferSettingsService`, branchement dans `payment-verify.service.ts` (le seul endroit qui crédite le wallet après vérification PSP, cf. ADR-017), et remplacement de la libération immédiate à la clôture par un job cron à délai (miroir exact du pattern `offers/cron/close-expired` déjà en prod).

**Tech Stack:** NestJS, Prisma, `node:test` (pas Jest — voir `apps/api/package.json` script `test`), Zod.

**Spec:** [`docs/adr/ADR-020-settlement-finance-model.md`](../../adr/ADR-020-settlement-finance-model.md) (décision formelle) et [`docs/superpowers/specs/2026-08-28-settlement-business-plan.md`](../specs/2026-08-28-settlement-business-plan.md) (narration complète, §3-§5).

## Global Constraints

- `offer1_external_enabled=false` — ne touche à aucun chemin EXTERNAL. N'importe où le code branche sur `TenantOfferType.EXTERNAL`, ne pas modifier ce chemin.
- Aucune régression sur `payment-verify.service.ts` : c'est le seul composant autorisé à créditer le wallet après `PaymentTransaction.SUCCEEDED` (ADR-017). Toute modification doit rester à l'intérieur du même `$transaction` existant.
- Ne jamais renommer `Event.commissionBps` ni changer son mécanisme — il est déjà admin-writable et déjà résolu event → tenant → plateforme dans le chemin **non-Escrow** legacy (`resolveCommissionCfa`, ligne 591 de `payment-verify.service.ts`). Ce plan ajoute la même logique de résolution **spécifiquement pour Escrow**, qui ne l'a pas aujourd'hui (elle lit un taux plateforme plat unique via `computeEscrowVoteCommissionCfa`).
- Portée volontairement réduite (hors scope de ce plan, cf. ADR-020 "Suivi") :
  - Pas de calcul de palier de confiance (F5) — `heldBps` utilise une constante plateforme unique (`settlement_held_bps`) en attendant F5.
  - Pas de distinction Tier Standard/Pro sur la commission (aucun concept "Tier Pro" n'existe encore dans le schéma — déféré à quand F6 le modélisera).
  - Pas d'exception "incident casse le gel" (dépend d'une détection de litige PSP qui n'existe pas encore, cf. ADR-020 TD-SETTLE-001).
  - Pas d'enforcement du cap mid-event (F3, touche `withdrawals.service.ts`, hors périmètre ledger).
- Gate de chaque tâche : `cd apps/api && npx tsc --noEmit` → 0 erreur, puis les tests `node:test` de la tâche passent.

---

## Task 1: Migration Prisma — schéma wallet + event + settings

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `apps/api/src/common/platform-settings.ts`
- Create: migration SQL sous `packages/db/prisma/migrations/` (générée par la commande à l'étape 2)

**Interfaces:**
- Produces: `OrganizerWallet.heldCfa` / `OrganizerWallet.withdrawableCfa` (remplace `pendingCfa`/`availableCfa`), `Event.heldBps: Int?`, `WalletLedgerKind.HELD_ALLOCATION` / `WalletLedgerKind.HELD_RELEASE`, `SETTLEMENT_HELD_BPS_KEY` + `DEFAULT_SETTLEMENT_HELD_BPS` (export depuis `platform-settings.ts`).

- [ ] **Step 1: Modifier le schéma Prisma**

Dans `packages/db/prisma/schema.prisma`, renommer les deux champs de `OrganizerWallet` :

```prisma
model OrganizerWallet {
  id            String   @id @default(cuid())
  tenantId      String   @unique
  withdrawableCfa Int    @default(0)
  heldCfa       Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant  Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  entries WalletLedgerEntry[]
}
```

Ajouter deux valeurs à l'enum ledger :

```prisma
enum WalletLedgerKind {
  VOTE_CREDIT
  TOPUP_CREDIT
  RETENTION_DEBIT
  WITHDRAWAL_DEBIT
  ADJUSTMENT
  HELD_ALLOCATION
  HELD_RELEASE
}
```

Ajouter un champ sur `Event` (à côté de `commissionBps` existant) :

```prisma
model Event {
  # ... champs existants inchangés ...
  commissionBps    Int?
  heldBps          Int?
  # ... reste du modèle inchangé ...
}
```

- [ ] **Step 2: Générer la migration en mode `--create-only` (ne pas laisser Prisma inférer un drop+recreate sur les colonnes renommées)**

```bash
cd packages/db && npx prisma migrate dev --name settlement_ledger_f2 --create-only --schema prisma/schema.prisma
```

- [ ] **Step 3: Éditer le SQL généré pour préserver les données existantes**

Ouvrir le fichier généré sous `packages/db/prisma/migrations/<timestamp>_settlement_ledger_f2/migration.sql`. Remplacer tout `DROP COLUMN "pendingCfa"` / `ADD COLUMN "heldCfa"` (perte de données) par un `RENAME COLUMN` :

```sql
ALTER TABLE "OrganizerWallet" RENAME COLUMN "pendingCfa" TO "heldCfa";
ALTER TABLE "OrganizerWallet" RENAME COLUMN "availableCfa" TO "withdrawableCfa";
ALTER TABLE "Event" ADD COLUMN "heldBps" INTEGER;
ALTER TYPE "WalletLedgerKind" ADD VALUE 'HELD_ALLOCATION';
ALTER TYPE "WalletLedgerKind" ADD VALUE 'HELD_RELEASE';
```

- [ ] **Step 4: Appliquer la migration et régénérer le client**

```bash
cd packages/db && npx prisma migrate dev --schema prisma/schema.prisma && npx prisma generate --schema prisma/schema.prisma
```

- [ ] **Step 5: Ajouter les nouvelles clés de config**

Dans `apps/api/src/common/platform-settings.ts`, ajouter après `OFFER2_PER_VOTE_COMMISSION_BPS_KEY` :

```ts
export const SETTLEMENT_HELD_BPS_KEY = "settlement_held_bps";
export const DEFAULT_SETTLEMENT_HELD_BPS = 5_000; // 50% — constante plateforme unique tant que F5 (palier de confiance) n'est pas livré.
export const HELD_RELEASE_DELAY_HOURS_KEY = "held_release_delay_hours";
export const DEFAULT_HELD_RELEASE_DELAY_HOURS = 48;
```

- [ ] **Step 6: Vérifier que le typecheck API passe déjà (avant tout code applicatif)**

Run: `cd apps/api && npx tsc --noEmit`
Expected: des erreurs vont apparaître partout où `pendingCfa`/`availableCfa` sont encore utilisés (`wallet.service.ts`, `event-settlement.service.ts`, leurs tests) — c'est attendu, elles seront corrigées aux tâches suivantes. Confirmer que les erreurs sont **uniquement** sur ces noms de champs, rien d'autre.

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/common/platform-settings.ts
git commit -m "feat(settlement): migrate wallet to held/withdrawable, add Event.heldBps"
```

---

## Task 2: `WalletService` — held/withdrawable + split credit

**Files:**
- Modify: `apps/api/src/offers/wallet.service.ts`
- Modify: `apps/api/src/offers/wallet.service.test.ts`

**Interfaces:**
- Consumes: `WalletLedgerKind` (Prisma enum, Task 1).
- Produces: `WalletCreditInput.target: "held" | "withdrawable"`, `WalletDebitInput.from: "held" | "withdrawable"`, `WalletService.creditSplit(input: WalletSplitCreditInput, tx?): Promise<{ wallet, heldEntry: WalletLedgerEntry | null, withdrawableEntry: WalletLedgerEntry | null }>`, `WalletService.releaseHeldToWithdrawable(args, tx?)` (renomme `releasePendingToAvailable`).

- [ ] **Step 1: Écrire le test qui échoue pour `creditSplit`**

Ajouter à la fin de `apps/api/src/offers/wallet.service.test.ts` :

```ts
test("creditSplit répartit net en held + withdrawable selon heldBps", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `wal-split-${Date.now().toString(36)}`,
      displayName: "Wallet Split Test"
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 10_000,
    heldBps: 5_000, // 50%
    kind: WalletLedgerKind.VOTE_CREDIT,
    note: "test split"
  });
  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.heldCfa, 5_000);
  assert.equal(w.withdrawableCfa, 5_000);
});

test("creditSplit avec heldBps=0 crédite tout en withdrawable", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `wal-split0-${Date.now().toString(36)}`,
      displayName: "Wallet Split Zero"
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 7_000,
    heldBps: 0,
    kind: WalletLedgerKind.VOTE_CREDIT,
    note: "test split zero held"
  });
  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.heldCfa, 0);
  assert.equal(w.withdrawableCfa, 7_000);
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Les tests de `offers/` ne passent pas par la chaîne de compilation `dist-test` du script `test` principal — ils tournent en `tsx` direct sur le `.ts` source, via le script `test:offers` (`apps/api/package.json:13`). Lancer directement :

Run: `cd apps/api && node --import tsx --test src/offers/wallet.service.test.ts`
Expected: FAIL — `wallet.creditSplit is not a function` (ou erreur de compilation `Property 'creditSplit' does not exist`).

- [ ] **Step 3: Réécrire `wallet.service.ts`**

Remplacer tout le contenu du fichier par :

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService["client"];

export type WalletCreditInput = {
  tenantId: string;
  amountCfa: number;
  kind: WalletLedgerKind;
  target: "held" | "withdrawable";
  eventId?: string | null;
  paymentId?: string | null;
  withdrawalId?: string | null;
  note?: string | null;
};

export type WalletDebitInput = {
  tenantId: string;
  amountCfa: number;
  kind: WalletLedgerKind;
  from: "held" | "withdrawable";
  eventId?: string | null;
  paymentId?: string | null;
  withdrawalId?: string | null;
  note?: string | null;
};

export type WalletSplitCreditInput = {
  tenantId: string;
  netCfa: number;
  heldBps: number;
  kind: WalletLedgerKind;
  eventId?: string | null;
  paymentId?: string | null;
  note?: string | null;
};

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma.client;
  }

  async getOrCreateWallet(tenantId: string, tx?: Prisma.TransactionClient) {
    const db = this.db(tx);
    const existing = await db.organizerWallet.findUnique({ where: { tenantId } });
    if (existing) return existing;
    try {
      return await db.organizerWallet.create({
        data: { tenantId, withdrawableCfa: 0, heldCfa: 0 }
      });
    } catch (err) {
      const again = await db.organizerWallet.findUnique({ where: { tenantId } });
      if (again) return again;
      throw err;
    }
  }

  async getWallet(tenantId: string) {
    const wallet = await this.getOrCreateWallet(tenantId);
    const recentEntries = await this.prisma.client.walletLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return {
      id: wallet.id,
      tenantId: wallet.tenantId,
      withdrawableCfa: wallet.withdrawableCfa,
      heldCfa: wallet.heldCfa,
      updatedAt: wallet.updatedAt,
      recentEntries
    };
  }

  /**
   * Credit the wallet and append a ledger entry. Runs in the caller's transaction when provided.
   */
  async credit(input: WalletCreditInput, tx?: Prisma.TransactionClient) {
    if (!Number.isInteger(input.amountCfa) || input.amountCfa <= 0) {
      throw new BadRequestException("Le montant de crédit doit être un entier positif.");
    }
    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(input.tenantId, db);
      const data =
        input.target === "held"
          ? { heldCfa: { increment: input.amountCfa } }
          : { withdrawableCfa: { increment: input.amountCfa } };
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data
      });
      const entry = await db.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          kind: input.kind,
          amountCfa: input.amountCfa,
          eventId: input.eventId ?? null,
          paymentId: input.paymentId ?? null,
          withdrawalId: input.withdrawalId ?? null,
          note: input.note ?? null
        }
      });
      return { wallet: updated, entry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  /**
   * Split a net vote/topup amount between held (reserve) and withdrawable,
   * per the vote-time formula (business plan §4): held = floor(net * heldBps / 10_000).
   * Writes one ledger entry per non-zero side (HELD_ALLOCATION-tagged calls
   * pass kind=HELD_ALLOCATION for the held portion; the withdrawable portion
   * keeps the caller's kind, e.g. VOTE_CREDIT).
   */
  async creditSplit(input: WalletSplitCreditInput, tx?: Prisma.TransactionClient) {
    if (!Number.isInteger(input.netCfa) || input.netCfa <= 0) {
      throw new BadRequestException("Le montant net doit être un entier positif.");
    }
    if (!Number.isInteger(input.heldBps) || input.heldBps < 0 || input.heldBps > 10_000) {
      throw new BadRequestException("heldBps doit être un entier entre 0 et 10000.");
    }
    const heldCfa = Math.floor((input.netCfa * input.heldBps) / 10_000);
    const withdrawableCfa = input.netCfa - heldCfa;

    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(input.tenantId, db);
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data: {
          heldCfa: { increment: heldCfa },
          withdrawableCfa: { increment: withdrawableCfa }
        }
      });

      let heldEntry = null;
      if (heldCfa > 0) {
        heldEntry = await db.walletLedgerEntry.create({
          data: {
            walletId: wallet.id,
            kind: WalletLedgerKind.HELD_ALLOCATION,
            amountCfa: heldCfa,
            eventId: input.eventId ?? null,
            paymentId: input.paymentId ?? null,
            note: input.note ? `${input.note} (réserve)` : "Réserve de sécurité"
          }
        });
      }

      let withdrawableEntry = null;
      if (withdrawableCfa > 0) {
        withdrawableEntry = await db.walletLedgerEntry.create({
          data: {
            walletId: wallet.id,
            kind: input.kind,
            amountCfa: withdrawableCfa,
            eventId: input.eventId ?? null,
            paymentId: input.paymentId ?? null,
            note: input.note ?? null
          }
        });
      }

      return { wallet: updated, heldEntry, withdrawableEntry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  /**
   * Debit the wallet (held or withdrawable) and append a ledger entry.
   * amountCfa is stored positive on the ledger; the balance is decremented.
   */
  async debit(input: WalletDebitInput, tx?: Prisma.TransactionClient) {
    if (!Number.isInteger(input.amountCfa) || input.amountCfa <= 0) {
      throw new BadRequestException("Le montant de débit doit être un entier positif.");
    }
    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(input.tenantId, db);
      if (input.from === "withdrawable" && wallet.withdrawableCfa < input.amountCfa) {
        throw new ConflictException(
          `Solde disponible insuffisant (${wallet.withdrawableCfa} FCFA) pour débiter ${input.amountCfa} FCFA.`
        );
      }
      if (input.from === "held" && wallet.heldCfa < input.amountCfa) {
        throw new ConflictException(
          `Solde en réserve insuffisant (${wallet.heldCfa} FCFA) pour débiter ${input.amountCfa} FCFA.`
        );
      }
      const data =
        input.from === "held"
          ? { heldCfa: { decrement: input.amountCfa } }
          : { withdrawableCfa: { decrement: input.amountCfa } };
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data
      });
      const entry = await db.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          kind: input.kind,
          amountCfa: input.amountCfa,
          eventId: input.eventId ?? null,
          paymentId: input.paymentId ?? null,
          withdrawalId: input.withdrawalId ?? null,
          note: input.note ?? null
        }
      });
      return { wallet: updated, entry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  /**
   * Move funds from held → withdrawable (no net change to total) with optional ledger note.
   * Used 48h after event closure (see EventSettlementService.releaseMaturedHeld).
   */
  async releaseHeldToWithdrawable(
    args: {
      tenantId: string;
      amountCfa: number;
      eventId?: string | null;
      note?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    if (!Number.isInteger(args.amountCfa) || args.amountCfa <= 0) {
      return null;
    }
    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(args.tenantId, db);
      if (wallet.heldCfa < args.amountCfa) {
        throw new ConflictException(
          `Impossible de libérer ${args.amountCfa} FCFA : solde en réserve insuffisant (${wallet.heldCfa} FCFA).`
        );
      }
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data: {
          heldCfa: { decrement: args.amountCfa },
          withdrawableCfa: { increment: args.amountCfa }
        }
      });
      const entry = await db.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          kind: WalletLedgerKind.HELD_RELEASE,
          amountCfa: args.amountCfa,
          eventId: args.eventId ?? null,
          note: args.note ?? "Libération held → withdrawable"
        }
      });
      return { wallet: updated, entry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  async assertWalletExists(tenantId: string) {
    const wallet = await this.prisma.client.organizerWallet.findUnique({ where: { tenantId } });
    if (!wallet) throw new NotFoundException("Portefeuille introuvable.");
    return wallet;
  }
}
```

- [ ] **Step 4: Corriger le test existant qui référence les anciens noms**

Dans `apps/api/src/offers/wallet.service.test.ts`, remplacer `target: "available"` par `target: "withdrawable"`, `from: "available"` par `from: "withdrawable"`, et `w.availableCfa` par `w.withdrawableCfa` (2 occurrences chacun dans le test `"wallet credit puis debit conserve le solde"`).

- [ ] **Step 5: Run pour vérifier que tout passe**

Run: `cd apps/api && node --import tsx --test src/offers/wallet.service.test.ts`
Expected: PASS (4 tests : le test `supportsSplit` existant + les 2 tests `credit`/`debit` + les 2 nouveaux `creditSplit`).

- [ ] **Step 6: Élargir le script `test:offers` — le filtre `--test-name-pattern` actuel exclurait les nouveaux tests**

Le script `test:offers` (`apps/api/package.json:13`) lance aujourd'hui `wallet.service.test.ts` avec `--test-name-pattern="seul FedaPay"`, ce qui **exclurait silencieusement** les 2 nouveaux tests `creditSplit` (leur nom ne contient pas "seul FedaPay"). Dans `apps/api/package.json`, remplacer la ligne `"test:offers"` par :

```json
    "test:offers": "node --import tsx --test src/offers/offers-cron.controller.test.ts src/offers/offer-commission.test.ts src/payments/psp/fedapay.gateway.test.ts src/offers/wallet.service.test.ts",
```

(Suppression du `--test-name-pattern` restrictif — tous les tests de `wallet.service.test.ts` tournent désormais, pas seulement ceux dont le nom contient "seul FedaPay".)

- [ ] **Step 7: Run le script complet pour confirmer qu'aucun test existant ne casse**

Run: `cd apps/api && npm run test:offers`
Expected: PASS — tous les tests des 4 fichiers listés passent.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/offers/wallet.service.ts apps/api/src/offers/wallet.service.test.ts apps/api/package.json
git commit -m "feat(wallet): rename pending/available to held/withdrawable, add creditSplit"
```

---

## Task 3: Résolution de commission Escrow (event → tenant → plateforme)

**Files:**
- Modify: `apps/api/src/offers/offer-settings.service.ts`
- Create: `apps/api/src/offers/offer-settings.service.test.ts`

**Interfaces:**
- Consumes: `PrismaService`, `SETTLEMENT_HELD_BPS_KEY` / `DEFAULT_SETTLEMENT_HELD_BPS` (Task 1).
- Produces: `OfferSettingsService.resolveEscrowCommissionBps(eventId: string): Promise<number>`, `OfferSettingsService.computeEscrowVoteCommissionCfaFromBps(amountCfa: number, bps: number): number`, `OfferSettingsService.getDefaultHeldBps(): Promise<number>`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/api/src/offers/offer-settings.service.test.ts` :

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../prisma/prisma.service";
import { OfferSettingsService } from "./offer-settings.service";
import { OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, OFFER2_PER_VOTE_COMMISSION_BPS_KEY } from "../common/platform-settings";

const prisma = new PrismaService();
const offerSettings = new OfferSettingsService(prisma);

async function enablePerVoteCommission(defaultBps: number) {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "true", updatedByUserId: "test" },
    update: { value: "true" }
  });
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY, value: String(defaultBps), updatedByUserId: "test" },
    update: { value: String(defaultBps) }
  });
}

test("resolveEscrowCommissionBps: utilise le taux plateforme par défaut sans override", async () => {
  await enablePerVoteCommission(800); // 8%
  const tenant = await prisma.client.tenant.create({
    data: { slug: `commis-none-${Date.now().toString(36)}`, displayName: "No Override" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event no override",
      slug: `ev-none-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 800);
});

test("resolveEscrowCommissionBps: l'override tenant prime sur le défaut plateforme", async () => {
  await enablePerVoteCommission(800);
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `commis-tenant-${Date.now().toString(36)}`,
      displayName: "Tenant Override",
      commissionBps: 600
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event tenant override",
      slug: `ev-tenant-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 600);
});

test("resolveEscrowCommissionBps: l'override event prime sur le tenant et le défaut", async () => {
  await enablePerVoteCommission(800);
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `commis-event-${Date.now().toString(36)}`,
      displayName: "Event Override",
      commissionBps: 600
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event override",
      slug: `ev-override-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      commissionBps: 450
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 450);
});

test("resolveEscrowCommissionBps: retourne 0 si la commission par vote est désactivée", async () => {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "false", updatedByUserId: "test" },
    update: { value: "false" }
  });
  const tenant = await prisma.client.tenant.create({
    data: { slug: `commis-disabled-${Date.now().toString(36)}`, displayName: "Disabled" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event disabled",
      slug: `ev-disabled-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 0);
});

test("computeEscrowVoteCommissionCfaFromBps: floor sur montant × bps / 10000", () => {
  assert.equal(offerSettings.computeEscrowVoteCommissionCfaFromBps(1_000, 800), 80);
  assert.equal(offerSettings.computeEscrowVoteCommissionCfaFromBps(1_000, 0), 0);
  assert.equal(offerSettings.computeEscrowVoteCommissionCfaFromBps(333, 800), 26);
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd apps/api && node --import tsx --test src/offers/offer-settings.service.test.ts`
Expected: FAIL — `offerSettings.resolveEscrowCommissionBps is not a function`.

- [ ] **Step 3: Ajouter les méthodes dans `offer-settings.service.ts`**

Ajouter l'import en haut du fichier (à côté des autres imports de `../common/platform-settings`) :

```ts
import {
  // ... imports existants ...
  SETTLEMENT_HELD_BPS_KEY,
  DEFAULT_SETTLEMENT_HELD_BPS
} from "../common/platform-settings";
```

Ajouter ces trois méthodes à la fin de la classe `OfferSettingsService`, après `computeEscrowVoteCommissionCfa` :

```ts
  /**
   * Résolution de la commission par vote pour l'offre Escrow : event override
   * → tenant override → taux plateforme par défaut. Ne fait AUCUNE distinction
   * Tier Standard/Pro (pas encore modélisé) — voir ADR-020 pour la portée F2.
   */
  async resolveEscrowCommissionBps(eventId: string): Promise<number> {
    const settings = await this.getSettings();
    if (!settings.offer2PerVoteCommissionEnabled) return 0;
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { commissionBps: true, tenant: { select: { commissionBps: true } } }
    });
    if (event?.commissionBps != null) return event.commissionBps;
    if (event?.tenant.commissionBps != null) return event.tenant.commissionBps;
    return settings.offer2PerVoteCommissionBps;
  }

  /** Commission calculée à partir d'un taux déjà résolu (pas du taux plat des settings). */
  computeEscrowVoteCommissionCfaFromBps(amountCfa: number, bps: number): number {
    if (bps <= 0) return 0;
    return Math.floor((amountCfa * bps) / 10_000);
  }

  /** Taux held plateforme par défaut, en attendant F5 (palier de confiance). */
  async getDefaultHeldBps(): Promise<number> {
    const setting = await this.prisma.client.platformSetting.findUnique({
      where: { key: SETTLEMENT_HELD_BPS_KEY }
    });
    return parseIntSetting(setting?.value, DEFAULT_SETTLEMENT_HELD_BPS);
  }
```

- [ ] **Step 4: Run pour vérifier que les tests passent**

Run: `cd apps/api && node --import tsx --test src/offers/offer-settings.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Ajouter le fichier au script `test:offers`**

Dans `apps/api/package.json`, ajouter `src/offers/offer-settings.service.test.ts` à la ligne `"test:offers"` (celle déjà modifiée à la Task 2, Step 6) :

```json
    "test:offers": "node --import tsx --test src/offers/offers-cron.controller.test.ts src/offers/offer-commission.test.ts src/payments/psp/fedapay.gateway.test.ts src/offers/wallet.service.test.ts src/offers/offer-settings.service.test.ts",
```

- [ ] **Step 6: Run le script complet**

Run: `cd apps/api && npm run test:offers`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/offers/offer-settings.service.ts apps/api/src/offers/offer-settings.service.test.ts apps/api/package.json
git commit -m "feat(offers): resolve escrow commission via event/tenant override chain"
```

---

## Task 4: Snapshot `heldBps` à l'activation de l'event

**Files:**
- Modify: `apps/api/src/events/events.service.ts:329-337` (méthode de quick-start)
- Modify: `apps/api/src/events/events.service.ts:764-773` (méthode `updateEvent`)
- Modify: `apps/api/src/events/events.service.test.ts` (si absent, créer un test ciblé — voir Step 1)

**Interfaces:**
- Consumes: `OfferSettingsService.getDefaultHeldBps()` (Task 3) — déjà injecté dans `EventsService` (import existant ligne 24).
- Produces: `Event.heldBps` posé à l'activation, jamais modifié ensuite (gel, cf. business plan §5.3).

- [ ] **Step 1: Écrire le test qui échoue**

`apps/api/src/events/events.service.test.ts` existe déjà (il utilise `prisma`/`resetDatabase` de `../test-utils/db`, les helpers `tenant(slug)` et `owner(tenantId)` déjà définis en tête de fichier, et `EventsService` y est déjà instancié avec `offerSettings` — 5e argument du constructeur). Ajouter l'import de la nouvelle clé de config, à la suite de l'import `OfferSettingsService` existant (ligne 14) :

```ts
import { SETTLEMENT_HELD_BPS_KEY } from "../common/platform-settings";
```

Puis ajouter ce test à la fin du fichier, en réutilisant les helpers déjà définis :

```ts
test("updateEvent: pose heldBps au moment de l'activation, jamais avant", async () => {
  await prisma.platformSetting.upsert({
    where: { key: SETTLEMENT_HELD_BPS_KEY },
    create: { key: SETTLEMENT_HELD_BPS_KEY, value: "5000", updatedByUserId: "test" },
    update: { value: "5000" }
  });
  const t = await tenant(`held-snap-${Date.now().toString(36)}`);
  const draft = await prisma.event.create({
    data: {
      tenantId: t.id,
      title: "Held snapshot event",
      slug: `ev-held-${Date.now().toString(36)}`,
      startsAt: new Date(future()),
      endsAt: new Date(new Date(future()).getTime() + 86_400_000)
    }
  });
  assert.equal(draft.heldBps, null);

  const activated = await events.updateEvent(owner(t.id), draft.id, { status: "ACTIVE" });
  assert.equal(activated.heldBps, 5_000);
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd apps/api && npx tsc -p tsconfig.test.json --outDir dist-test && node --test dist-test/events/events.service.test.js`
Expected: FAIL — `activated.heldBps` est `undefined`/`null` au lieu de `5000`.

- [ ] **Step 3: Modifier `quickStartEvent`**

Dans `apps/api/src/events/events.service.ts`, remplacer (autour de la ligne 329) :

```ts
    let activated = false;
    try {
      await this.assertCanActivate(createdEvent);
      const activeEvent = await this.prisma.client.event.update({
        where: { id: createdEvent.id },
        data: { status: EventStatus.ACTIVE }
      });
```

par :

```ts
    let activated = false;
    try {
      await this.assertCanActivate(createdEvent);
      const heldBps = await this.offerSettings.getDefaultHeldBps();
      const activeEvent = await this.prisma.client.event.update({
        where: { id: createdEvent.id },
        data: { status: EventStatus.ACTIVE, heldBps }
      });
```

- [ ] **Step 4: Modifier `updateEvent`**

Dans le même fichier, remplacer (autour de la ligne 764) :

```ts
    const isActivating = input.status === EventStatus.ACTIVE && event.status !== EventStatus.ACTIVE;
    if (isActivating) {
      await this.assertCanActivate(event);
      await this.assertExternalOfferReady(user.tenantId, event.provider);
    }
```

par :

```ts
    const isActivating = input.status === EventStatus.ACTIVE && event.status !== EventStatus.ACTIVE;
    if (isActivating) {
      await this.assertCanActivate(event);
      await this.assertExternalOfferReady(user.tenantId, event.provider);
      data.heldBps = await this.offerSettings.getDefaultHeldBps();
    }
```

- [ ] **Step 5: Run pour vérifier que le test passe**

Run: `cd apps/api && npx tsc -p tsconfig.test.json --outDir dist-test && node --test dist-test/events/events.service.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/events/events.service.ts apps/api/src/events/events.service.test.ts
git commit -m "feat(events): snapshot heldBps at activation, frozen like commissionBps"
```

---

## Task 5: Brancher `payment-verify.service.ts` sur le split held/withdrawable

**Files:**
- Modify: `apps/api/src/payments/payment-verify.service.ts:473-589` (méthodes `resolveCommissionForTx` et `applyOfferWalletEffects`)
- Modify: `apps/api/src/auth/auth-security.test.ts` ou test dédié — voir Step 1 (créer `apps/api/src/payments/payment-verify.wallet-split.test.ts`)

**Interfaces:**
- Consumes: `OfferSettingsService.resolveEscrowCommissionBps` / `computeEscrowVoteCommissionCfaFromBps` (Task 3), `WalletService.creditSplit` (Task 2), `Event.heldBps` (Task 4).
- Produces: le crédit ESCROW d'un vote alimente désormais `heldCfa`/`withdrawableCfa` au lieu du seul `pendingCfa`.

- [ ] **Step 1: Écrire le test d'intégration qui échoue**

Créer `apps/api/src/payments/payment-verify.wallet-split.test.ts` :

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { PaymentProvider, PaymentPurpose, PaymentStatus, TenantOfferType, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../offers/wallet.service";
import { OfferSettingsService } from "../offers/offer-settings.service";
import { PaymentVerifyService } from "./payment-verify.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PspRegistry } from "./psp/psp.registry";
import {
  OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY,
  OFFER2_PER_VOTE_COMMISSION_BPS_KEY,
  SETTLEMENT_HELD_BPS_KEY
} from "../common/platform-settings";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);
const offerSettings = new OfferSettingsService(prisma);
const notifications = new NotificationsService(prisma);
const pspRegistry = {} as PspRegistry; // non utilisé par applyDemoSuccess
const verifyService = new PaymentVerifyService(prisma, notifications, pspRegistry, wallet, offerSettings);

test("applyDemoSuccess (ESCROW, vote): crédite held+withdrawable selon heldBps et commissionBps de l'event", async () => {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "true", updatedByUserId: "test" },
    update: { value: "true" }
  });
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY, value: "1000", updatedByUserId: "test" }, // 10%
    update: { value: "1000" }
  });
  await prisma.client.platformSetting.upsert({
    where: { key: SETTLEMENT_HELD_BPS_KEY },
    create: { key: SETTLEMENT_HELD_BPS_KEY, value: "5000", updatedByUserId: "test" }, // 50%
    update: { value: "5000" }
  });

  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `pv-split-${Date.now().toString(36)}`,
      displayName: "PV Split",
      offerType: TenantOfferType.ESCROW
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "PV split event",
      slug: `ev-pv-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      heldBps: 5_000
    }
  });
  const candidate = await prisma.client.candidate.create({
    data: { eventId: event.id, fullName: "Candidate PV", publicRef: `cand-${Date.now().toString(36)}` }
  });
  const vote = await prisma.client.vote.create({
    data: { eventId: event.id, candidateId: candidate.id, amountCfa: 1_000, currency: "XOF" }
  });
  const tx = await prisma.client.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      purpose: PaymentPurpose.VOTE,
      provider: PaymentProvider.FEEXPAY,
      status: PaymentStatus.PENDING,
      amountCfa: 1_000,
      currency: "XOF",
      providerRef: `pvref-${Date.now().toString(36)}`
    }
  });

  await verifyService.applyDemoSuccess(tx.id);

  // brut=1000, commission=10%=100, net=900, held=50%*900=450, withdrawable=450.
  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.heldCfa, 450);
  assert.equal(w.withdrawableCfa, 450);

  const heldEntry = w.recentEntries.find((e) => e.kind === WalletLedgerKind.HELD_ALLOCATION);
  assert.ok(heldEntry);
  assert.equal(heldEntry.amountCfa, 450);
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd apps/api && npx tsc -p tsconfig.test.json --outDir dist-test && node --test dist-test/payments/payment-verify.wallet-split.test.js`
Expected: FAIL — `w.heldCfa` vaut `0` (tout est encore crédité en `withdrawableCfa`/ancien `pending` via `credit()` avec `target: "held"` non scindé).

- [ ] **Step 3: Modifier `resolveCommissionForTx` dans `payment-verify.service.ts`**

Remplacer (lignes 479-508 actuelles) :

```ts
  private async resolveCommissionForTx(tx: {
    purpose: PaymentPurpose;
    eventId: string;
    amountCfa: number;
    tenantId: string;
  }): Promise<number | null> {
    if (tx.purpose === PaymentPurpose.VOTE) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tx.tenantId },
        select: { offerType: true }
      });
      if (tenant?.offerType === TenantOfferType.ESCROW) {
        const settings = await this.offerSettings.getSettings();
        return this.offerSettings.computeEscrowVoteCommissionCfa(settings, tx.amountCfa);
      }
      if (tenant?.offerType === TenantOfferType.EXTERNAL) {
        const settings = await this.offerSettings.getSettings();
        return this.offerSettings.computeExternalCommissionCfa(settings, tx.amountCfa);
      }
      return this.resolveCommissionCfa(tx.eventId, tx.amountCfa);
    }
    if (tx.purpose === PaymentPurpose.ORGANIZER_VOTE_TOPUP) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tx.tenantId },
        select: { offerType: true }
      });
      if (tenant?.offerType === TenantOfferType.EXTERNAL) {
        // Amount paid IS the platform commission.
        return tx.amountCfa;
      }
      if (tenant?.offerType === TenantOfferType.ESCROW) {
        const settings = await this.offerSettings.getSettings();
        return this.offerSettings.computeEscrowVoteCommissionCfa(settings, tx.amountCfa);
      }
      return 0;
    }
    return null;
  }
```

par :

```ts
  private async resolveCommissionForTx(tx: {
    purpose: PaymentPurpose;
    eventId: string;
    amountCfa: number;
    tenantId: string;
  }): Promise<number | null> {
    if (tx.purpose === PaymentPurpose.VOTE) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tx.tenantId },
        select: { offerType: true }
      });
      if (tenant?.offerType === TenantOfferType.ESCROW) {
        const bps = await this.offerSettings.resolveEscrowCommissionBps(tx.eventId);
        return this.offerSettings.computeEscrowVoteCommissionCfaFromBps(tx.amountCfa, bps);
      }
      if (tenant?.offerType === TenantOfferType.EXTERNAL) {
        const settings = await this.offerSettings.getSettings();
        return this.offerSettings.computeExternalCommissionCfa(settings, tx.amountCfa);
      }
      return this.resolveCommissionCfa(tx.eventId, tx.amountCfa);
    }
    if (tx.purpose === PaymentPurpose.ORGANIZER_VOTE_TOPUP) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tx.tenantId },
        select: { offerType: true }
      });
      if (tenant?.offerType === TenantOfferType.EXTERNAL) {
        // Amount paid IS the platform commission.
        return tx.amountCfa;
      }
      if (tenant?.offerType === TenantOfferType.ESCROW) {
        const bps = await this.offerSettings.resolveEscrowCommissionBps(tx.eventId);
        return this.offerSettings.computeEscrowVoteCommissionCfaFromBps(tx.amountCfa, bps);
      }
      return 0;
    }
    return null;
  }
```

- [ ] **Step 4: Modifier `applyOfferWalletEffects` pour utiliser `creditSplit`**

Remplacer le bloc ESCROW (lignes 541-577 actuelles) :

```ts
    if (tenant.offerType === TenantOfferType.ESCROW) {
      const commission = tx.commissionCfa ?? 0;
      if (tx.purpose === PaymentPurpose.VOTE) {
        const net = Math.max(0, tx.amountCfa - commission);
        if (net > 0) {
          await this.wallet.credit(
            {
              tenantId: tx.tenantId,
              amountCfa: net,
              kind: WalletLedgerKind.VOTE_CREDIT,
              target: "pending",
              eventId: tx.eventId,
              paymentId: tx.id,
              note: "Crédit vote (escrow)"
            },
            trx
          );
        }
      } else {
        // ORGANIZER_VOTE_TOPUP: full amount credited to pending wallet.
        if (tx.amountCfa > 0) {
          await this.wallet.credit(
            {
              tenantId: tx.tenantId,
              amountCfa: tx.amountCfa,
              kind: WalletLedgerKind.TOPUP_CREDIT,
              target: "pending",
              eventId: tx.eventId,
              paymentId: tx.id,
              note: "Crédit top-up orga (escrow)"
            },
            trx
          );
        }
      }
      return;
    }
```

par :

```ts
    if (tenant.offerType === TenantOfferType.ESCROW) {
      const commission = tx.commissionCfa ?? 0;
      if (tx.purpose === PaymentPurpose.VOTE) {
        const net = Math.max(0, tx.amountCfa - commission);
        if (net > 0) {
          const event = await trx.event.findUnique({
            where: { id: tx.eventId },
            select: { heldBps: true }
          });
          await this.wallet.creditSplit(
            {
              tenantId: tx.tenantId,
              netCfa: net,
              heldBps: event?.heldBps ?? 0,
              kind: WalletLedgerKind.VOTE_CREDIT,
              eventId: tx.eventId,
              paymentId: tx.id,
              note: "Crédit vote (escrow)"
            },
            trx
          );
        }
      } else {
        // ORGANIZER_VOTE_TOPUP: full amount credited directly to withdrawable
        // (a top-up is the organizer's own money, not at-risk vote revenue —
        // it does not go through the held reserve).
        if (tx.amountCfa > 0) {
          await this.wallet.credit(
            {
              tenantId: tx.tenantId,
              amountCfa: tx.amountCfa,
              kind: WalletLedgerKind.TOPUP_CREDIT,
              target: "withdrawable",
              eventId: tx.eventId,
              paymentId: tx.id,
              note: "Crédit top-up orga (escrow)"
            },
            trx
          );
        }
      }
      return;
    }
```

- [ ] **Step 5: Run pour vérifier que le test passe**

Run: `cd apps/api && npx tsc -p tsconfig.test.json --outDir dist-test && node --test dist-test/payments/payment-verify.wallet-split.test.js`
Expected: PASS.

- [ ] **Step 6: Ajouter le nouveau fichier de test au script `test` principal**

`payment-verify.wallet-split.test.ts` est un nouveau fichier dans `payments/`, qui passe par la chaîne de compilation `dist-test` du script `test` principal (pas `test:offers` — c'est réservé à `offers/`). Dans `apps/api/package.json`, dans la ligne `"test"`, ajouter `dist-test/payments/payment-verify.wallet-split.test.js` à la suite de `dist-test/payments/payment-verify.service.test.js` dans la liste d'arguments de `node --test --test-concurrency=1 ...`.

- [ ] **Step 7: Run la suite complète de tests API pour vérifier l'absence de régression**

Run: `cd apps/api && npm test`
Expected: tous les tests listés dans `package.json` (`dist-test/**/*.test.js`) passent, y compris le nouveau `dist-test/payments/payment-verify.wallet-split.test.js`, `dist-test/events/events.service.test.js`, `dist-test/subscriptions/subscriptions.service.test.js`, `dist-test/auth/auth-security.test.js`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/payments/payment-verify.service.ts apps/api/src/payments/payment-verify.wallet-split.test.ts apps/api/package.json
git commit -m "feat(payments): credit escrow votes via held/withdrawable split"
```

---

## Task 6: Une seule commission — désactiver la retenue 5% + libération held à J+48h

**Files:**
- Modify: `apps/api/src/offers/event-settlement.service.ts`
- Modify: `apps/api/src/offers/offers-cron.controller.ts`
- Create/Modify: `apps/api/src/offers/event-settlement.service.test.ts` (créer s'il n'existe pas déjà — vérifier d'abord)

**Interfaces:**
- Consumes: `WalletService.releaseHeldToWithdrawable` (Task 2, renommé), `HELD_RELEASE_DELAY_HOURS_KEY` / `DEFAULT_HELD_RELEASE_DELAY_HOURS` (Task 1).
- Produces: `EventSettlementService.releaseMaturedHeld(limit?: number): Promise<{ selected, released, skipped, failed, failures }>`.

- [ ] **Step 1: Écrire le test qui échoue**

`apps/api/src/offers/event-settlement.service.test.ts` n'existe pas encore — le créer avec ce contenu complet (imports + instanciation, même convention que `wallet.service.test.ts` du même dossier) :

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { EventStatus, TenantOfferType, UserRole, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";
import { OfferSettingsService } from "./offer-settings.service";
import { EventStatsService } from "./event-stats.service";
import { EventSettlementService } from "./event-settlement.service";
import { OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY } from "../common/platform-settings";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);
const offerSettings = new OfferSettingsService(prisma);
const eventStats = new EventStatsService(prisma, wallet);
const settlement = new EventSettlementService(prisma, wallet, offerSettings, eventStats);

test("closeEvent: n'applique PAS la retenue 5% quand la commission par vote est active", async () => {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "true", updatedByUserId: "test" },
    update: { value: "true" }
  });
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `close-novote-${Date.now().toString(36)}`,
      displayName: "Close No Retention",
      offerType: TenantOfferType.ESCROW
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Close no retention",
      slug: `ev-close-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      status: EventStatus.ACTIVE,
      heldBps: 5_000
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 1_000,
    heldBps: 5_000,
    kind: WalletLedgerKind.VOTE_CREDIT,
    eventId: event.id
  });

  const user = { userId: "u1", tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER, email: "o@test.dev" };
  const result = await settlement.closeEvent(user, event.id);
  assert.equal(result.retentionCfa, 0);
});

test("releaseMaturedHeld: libère le held des events clôturés il y a plus de 48h, pas les plus récents", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `release-${Date.now().toString(36)}`,
      displayName: "Release Held",
      offerType: TenantOfferType.ESCROW
    }
  });
  const matureEvent = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Mature",
      slug: `ev-mature-${Date.now().toString(36)}`,
      startsAt: new Date(Date.now() - 172_800_000),
      endsAt: new Date(Date.now() - 100_000_000),
      status: EventStatus.CLOSED,
      closedAt: new Date(Date.now() - 172_800_000), // 48h+ dans le passé
      heldBps: 5_000
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 1_000,
    heldBps: 5_000,
    kind: WalletLedgerKind.VOTE_CREDIT,
    eventId: matureEvent.id
  });

  const recentEvent = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Recent",
      slug: `ev-recent-${Date.now().toString(36)}`,
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(),
      status: EventStatus.CLOSED,
      closedAt: new Date(), // clôturé maintenant, pas encore mûr
      heldBps: 5_000
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 2_000,
    heldBps: 5_000,
    kind: WalletLedgerKind.VOTE_CREDIT,
    eventId: recentEvent.id
  });

  const result = await settlement.releaseMaturedHeld();
  assert.equal(result.released, 1);

  const w = await wallet.getWallet(tenant.id);
  // matureEvent: held=500 libéré → withdrawable += 500. recentEvent: held=1000 reste bloqué.
  assert.equal(w.heldCfa, 1_000);
  assert.equal(w.withdrawableCfa, 1_500 + 500);
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd apps/api && node --import tsx --test src/offers/event-settlement.service.test.ts`
Expected: FAIL — `settlement.releaseMaturedHeld is not a function`, et le test de rétention échoue (`retentionCfa` vaut encore `50`, pas `0`).

- [ ] **Step 3: Gater la retenue derrière le flag dans `event-settlement.service.ts`**

Remplacer (dans `closeEvent`, le bloc qui calcule `retentionCfa`) :

```ts
        let credited = 0;
        let alreadyDebited = 0;
        for (const e of entries) {
          if (
            e.kind === WalletLedgerKind.VOTE_CREDIT ||
            e.kind === WalletLedgerKind.TOPUP_CREDIT
          ) {
            credited += e.amountCfa;
          } else if (
            e.kind === WalletLedgerKind.RETENTION_DEBIT ||
            e.kind === WalletLedgerKind.WITHDRAWAL_DEBIT
          ) {
            alreadyDebited += e.amountCfa;
          } else if (e.kind === WalletLedgerKind.ADJUSTMENT && e.note?.includes("Libération")) {
            // Already released to available — treat as out of pending pool.
            alreadyDebited += e.amountCfa;
          }
        }

        const pendingForEvent = Math.max(0, credited - alreadyDebited);
        if (pendingForEvent > 0) {
          retentionCfa = Math.floor(
            (pendingForEvent * settings.offer2RetentionBps) / 10_000
          );
          const toRelease = pendingForEvent - retentionCfa;

          if (retentionCfa > 0) {
            await this.wallet.debit(
              {
                tenantId: user.tenantId,
                amountCfa: retentionCfa,
                kind: WalletLedgerKind.RETENTION_DEBIT,
                from: "pending",
                eventId: event.id,
                note: `Retenue plateforme ${settings.offer2RetentionBps} bps`
              },
              tx
            );
          }

          if (toRelease > 0) {
            await this.wallet.releasePendingToAvailable(
              {
                tenantId: user.tenantId,
                amountCfa: toRelease,
                eventId: event.id,
                note: "Libération pending → available après clôture"
              },
              tx
            );
            releasedCfa = toRelease;
          }
        }
```

par (retenue désactivée quand la commission par vote est active — "une seule commission, pas deux", cf. business plan §3 ; et la libération à la clôture est supprimée : le held mûrit désormais via `releaseMaturedHeld`, pas ici) :

```ts
        if (!settings.offer2PerVoteCommissionEnabled) {
          let credited = 0;
          let alreadyDebited = 0;
          for (const e of entries) {
            if (
              e.kind === WalletLedgerKind.VOTE_CREDIT ||
              e.kind === WalletLedgerKind.TOPUP_CREDIT
            ) {
              credited += e.amountCfa;
            } else if (
              e.kind === WalletLedgerKind.RETENTION_DEBIT ||
              e.kind === WalletLedgerKind.WITHDRAWAL_DEBIT
            ) {
              alreadyDebited += e.amountCfa;
            } else if (e.kind === WalletLedgerKind.ADJUSTMENT && e.note?.includes("Libération")) {
              alreadyDebited += e.amountCfa;
            }
          }

          const pendingForEvent = Math.max(0, credited - alreadyDebited);
          if (pendingForEvent > 0) {
            retentionCfa = Math.floor(
              (pendingForEvent * settings.offer2RetentionBps) / 10_000
            );
            const toRelease = pendingForEvent - retentionCfa;

            if (retentionCfa > 0) {
              await this.wallet.debit(
                {
                  tenantId: user.tenantId,
                  amountCfa: retentionCfa,
                  kind: WalletLedgerKind.RETENTION_DEBIT,
                  from: "held",
                  eventId: event.id,
                  note: `Retenue plateforme ${settings.offer2RetentionBps} bps`
                },
                tx
              );
            }

            if (toRelease > 0) {
              await this.wallet.releaseHeldToWithdrawable(
                {
                  tenantId: user.tenantId,
                  amountCfa: toRelease,
                  eventId: event.id,
                  note: "Libération held → withdrawable après clôture (legacy retenue)"
                },
                tx
              );
              releasedCfa = toRelease;
            }
          }
        }
        // Quand offer2PerVoteCommissionEnabled=true : aucune retenue ni
        // libération ici. Le held de cet event a déjà été alloué vote par
        // vote (creditSplit) et se libère 48h après clôture via
        // EventSettlementService.releaseMaturedHeld — pas à la clôture elle-même.
```

- [ ] **Step 4: Ajouter `releaseMaturedHeld` à `event-settlement.service.ts`**

Ajouter en haut du fichier l'import des nouvelles clés de config :

```ts
import {
  HELD_RELEASE_DELAY_HOURS_KEY,
  DEFAULT_HELD_RELEASE_DELAY_HOURS,
  parseIntSetting
} from "../common/platform-settings";
```

Ajouter cette méthode juste avant la dernière accolade fermante de la classe (après `closeExpiredEvents`) :

```ts
  /**
   * Libère heldCfa → withdrawableCfa pour les events Escrow clôturés depuis
   * plus de `held_release_delay_hours` (défaut 48h, business plan §4 Phase D).
   * Ne touche jamais un event dont le held a déjà été entièrement libéré :
   * on somme les entrées HELD_ALLOCATION vs HELD_RELEASE déjà écrites pour cet
   * event et on ne libère que le reliquat.
   */
  async releaseMaturedHeld(limit = 100): Promise<{
    selected: number;
    released: number;
    skipped: number;
    failed: number;
    failures: Array<{ eventId: string; reason: string }>;
  }> {
    const delaySetting = await this.prisma.client.platformSetting.findUnique({
      where: { key: HELD_RELEASE_DELAY_HOURS_KEY }
    });
    const delayHours = parseIntSetting(delaySetting?.value, DEFAULT_HELD_RELEASE_DELAY_HOURS);
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000);

    const matured = await this.prisma.client.event.findMany({
      where: {
        status: EventStatus.CLOSED,
        closedAt: { lte: cutoff },
        tenant: { offerType: TenantOfferType.ESCROW }
      },
      select: { id: true, tenantId: true },
      orderBy: [{ closedAt: "asc" }, { id: "asc" }],
      take: Math.min(Math.max(limit, 1), 500)
    });

    let released = 0;
    let skipped = 0;
    const failures: Array<{ eventId: string; reason: string }> = [];
    for (const ev of matured) {
      try {
        await this.prisma.client.$transaction(async (tx) => {
          const wallet = await this.wallet.getOrCreateWallet(ev.tenantId, tx);
          const entries = await tx.walletLedgerEntry.findMany({
            where: { walletId: wallet.id, eventId: ev.id }
          });
          let allocated = 0;
          let alreadyReleased = 0;
          for (const e of entries) {
            if (e.kind === WalletLedgerKind.HELD_ALLOCATION) allocated += e.amountCfa;
            else if (e.kind === WalletLedgerKind.HELD_RELEASE) alreadyReleased += e.amountCfa;
          }
          const toRelease = Math.max(0, allocated - alreadyReleased);
          if (toRelease === 0) {
            skipped += 1;
            return;
          }
          await this.wallet.releaseHeldToWithdrawable(
            {
              tenantId: ev.tenantId,
              amountCfa: toRelease,
              eventId: ev.id,
              note: "Libération held → withdrawable (48h post-clôture)"
            },
            tx
          );
          released += 1;
        });
      } catch (error) {
        failures.push({
          eventId: ev.id,
          reason: error instanceof Error ? error.message : "Erreur inconnue"
        });
      }
    }
    return {
      selected: matured.length,
      released,
      skipped,
      failed: failures.length,
      failures
    };
  }
```

- [ ] **Step 5: Ajouter l'endpoint cron dans `offers-cron.controller.ts`**

Dans `apps/api/src/offers/offers-cron.controller.ts`, ajouter un schéma et une action miroir de `close-expired` :

```ts
const releaseHeldSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  runAtIso: z.string().min(1)
});
```

Ajouter cette méthode dans la classe `OffersCronController`, après `closeExpired` :

```ts
  @Post("release-held")
  async releaseHeld(
    @Body() body: unknown,
    @Headers("x-maintenance-cron-signature") signature?: string
  ) {
    if (!signature) throw new BadRequestException("Signature cron manquante.");

    const parsed = releaseHeldSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const expected = createHmac("sha256", env.API_MAINTENANCE_CRON_SECRET)
      .update(stableStringify(body ?? {}))
      .digest("hex");
    const received = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (
      received.length !== expectedBuffer.length ||
      !timingSafeEqual(received, expectedBuffer)
    ) {
      throw new BadRequestException("Signature cron invalide.");
    }

    const runAt = new Date(parsed.data.runAtIso);
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException("runAtIso invalide.");
    }
    if (
      Math.abs(Date.now() - runAt.getTime()) >
      env.API_MAINTENANCE_CRON_MAX_SKEW_SECONDS * 1000
    ) {
      throw new BadRequestException("runAtIso hors fenêtre autorisée.");
    }

    return this.settlement.releaseMaturedHeld(parsed.data.limit);
  }
```

- [ ] **Step 6: Run pour vérifier que les tests passent**

Run: `cd apps/api && node --import tsx --test src/offers/event-settlement.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Ajouter le fichier au script `test:offers`**

Dans `apps/api/package.json`, ajouter `src/offers/event-settlement.service.test.ts` à la ligne `"test:offers"` :

```json
    "test:offers": "node --import tsx --test src/offers/offers-cron.controller.test.ts src/offers/offer-commission.test.ts src/payments/psp/fedapay.gateway.test.ts src/offers/wallet.service.test.ts src/offers/offer-settings.service.test.ts src/offers/event-settlement.service.test.ts",
```

- [ ] **Step 8: Run la suite complète + typecheck**

Run: `cd apps/api && npx tsc --noEmit && npm run test:offers && npm test`
Expected: 0 erreur typecheck, tous les tests passent (les deux scripts, `test:offers` et `test`).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/offers/event-settlement.service.ts apps/api/src/offers/event-settlement.service.test.ts apps/api/src/offers/offers-cron.controller.ts apps/api/package.json
git commit -m "feat(settlement): gate 5% retention behind per-vote flag, release held at J+48h via cron"
```

---

## Task 7: Endpoint admin — override commission event/tenant (floor/ceiling + super-admin + audit)

**Files:**
- Modify: `apps/api/src/offers/organizer-offers.service.ts` (ajouter la logique de validation/écriture)
- Modify: `apps/api/src/offers/admin-offers.controller.ts` (ajouter les routes)
- Create: `apps/api/src/offers/commission-override.service.test.ts`
- Create: `apps/api/src/offers/commission-override.service.ts` (nouveau, plutôt que surcharger `organizer-offers.service.ts` — responsabilité dédiée)

**Interfaces:**
- Consumes: `PrismaService`, `UserRole` (`@prisma/client`), `AuthUser`.
- Produces: `CommissionOverrideService.setEventCommission(user: AuthUser, eventId: string, bps: number): Promise<{ eventId, commissionBps }>`, `CommissionOverrideService.setTenantCommission(user: AuthUser, tenantId: string, bps: number): Promise<{ tenantId, commissionBps }>`. Routes `PUT /admin/offers/events/:eventId/commission` et `PUT /admin/offers/tenants/:tenantId/commission`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/api/src/offers/commission-override.service.test.ts` :

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CommissionOverrideService } from "./commission-override.service";

const prisma = new PrismaService();
const overrides = new CommissionOverrideService(prisma);

function adminUser(role: UserRole) {
  return { userId: "admin-1", tenantId: "n/a", role, email: "admin@test.dev" };
}

test("setEventCommission: accepte un taux dans la fourchette 4-12% pour un admin normal", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-event-${Date.now().toString(36)}`, displayName: "CO Event" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO event",
      slug: `ev-co-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const result = await overrides.setEventCommission(adminUser(UserRole.PLATFORM_ADMIN), event.id, 800);
  assert.equal(result.commissionBps, 800);
  const updated = await prisma.client.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(updated.commissionBps, 800);
});

test("setEventCommission: rejette un admin normal hors fourchette 4-12%", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-reject-${Date.now().toString(36)}`, displayName: "CO Reject" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO reject",
      slug: `ev-reject-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  await assert.rejects(
    () => overrides.setEventCommission(adminUser(UserRole.PLATFORM_ADMIN), event.id, 300),
    /super-admin/i
  );
});

test("setEventCommission: un super-admin peut sortir de la fourchette 4-12%, et ça écrit un audit log", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-super-${Date.now().toString(36)}`, displayName: "CO Super" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO super",
      slug: `ev-super-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const result = await overrides.setEventCommission(
    adminUser(UserRole.PLATFORM_SUPER_ADMIN),
    event.id,
    300
  );
  assert.equal(result.commissionBps, 300);

  const audits = await prisma.client.auditLog.findMany({
    where: { targetType: "Event", targetId: event.id, action: "commission.override_event" }
  });
  assert.equal(audits.length, 1);
  assert.equal((audits[0].metadata as { newBps: number }).newBps, 300);
});

test("setEventCommission: rejette un event déjà activé (gel total)", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-frozen-${Date.now().toString(36)}`, displayName: "CO Frozen" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO frozen",
      slug: `ev-frozen-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      status: "ACTIVE"
    }
  });
  await assert.rejects(
    () => overrides.setEventCommission(adminUser(UserRole.PLATFORM_ADMIN), event.id, 800),
    /activé/i
  );
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `cd apps/api && node --import tsx --test src/offers/commission-override.service.test.ts`
Expected: FAIL — le module `./commission-override.service` n'existe pas encore (erreur de compilation).

- [ ] **Step 3: Créer `commission-override.service.ts`**

```ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

/** Fourchette publique de commission (business plan §5.5). En sortir exige PLATFORM_SUPER_ADMIN. */
const COMMISSION_FLOOR_BPS = 400; // 4%
const COMMISSION_CEILING_BPS = 1_200; // 12%

@Injectable()
export class CommissionOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  private assertBpsAllowed(user: AuthUser, bps: number): void {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      throw new BadRequestException("Le taux de commission doit être un entier entre 0 et 10000 (bps).");
    }
    const outOfRange = bps < COMMISSION_FLOOR_BPS || bps > COMMISSION_CEILING_BPS;
    if (outOfRange && user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException(
        `Un taux hors de la fourchette ${COMMISSION_FLOOR_BPS}-${COMMISSION_CEILING_BPS} bps nécessite le rôle super-admin.`
      );
    }
  }

  async setEventCommission(user: AuthUser, eventId: string, bps: number) {
    this.assertBpsAllowed(user, bps);
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { id: true, tenantId: true, status: true, commissionBps: true }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        "Le taux de commission d'un event déjà activé est gelé — impossible de le modifier."
      );
    }

    const oldBps = event.commissionBps;
    await this.prisma.client.$transaction([
      this.prisma.client.event.update({
        where: { id: event.id },
        data: { commissionBps: bps }
      }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: event.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "commission.override_event",
          targetType: "Event",
          targetId: event.id,
          metadata: { oldBps, newBps: bps }
        }
      })
    ]);
    return { eventId: event.id, commissionBps: bps };
  }

  async setTenantCommission(user: AuthUser, tenantId: string, bps: number) {
    this.assertBpsAllowed(user, bps);
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, commissionBps: true }
    });
    if (!tenant) throw new NotFoundException("Organisateur introuvable.");

    const oldBps = tenant.commissionBps;
    await this.prisma.client.$transaction([
      this.prisma.client.tenant.update({
        where: { id: tenant.id },
        data: { commissionBps: bps }
      }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "commission.override_tenant",
          targetType: "Tenant",
          targetId: tenant.id,
          metadata: { oldBps, newBps: bps }
        }
      })
    ]);
    return { tenantId: tenant.id, commissionBps: bps };
  }
}
```

- [ ] **Step 4: Run pour vérifier que les tests passent**

Run: `cd apps/api && node --import tsx --test src/offers/commission-override.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Brancher les routes admin**

Dans `apps/api/src/offers/admin-offers.controller.ts`, ajouter l'import et l'injection :

```ts
import { CommissionOverrideService } from "./commission-override.service";
```

Ajouter `private readonly commissionOverride: CommissionOverrideService` au constructeur (à la suite des paramètres existants), puis ajouter ces deux routes après `eventDetail` :

```ts
  @Put("events/:eventId/commission")
  setEventCommission(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: { commissionBps: number }
  ) {
    return this.commissionOverride.setEventCommission(user, eventId, body.commissionBps);
  }

  @Put("tenants/:tenantId/commission")
  setTenantCommission(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body() body: { commissionBps: number }
  ) {
    return this.commissionOverride.setTenantCommission(user, tenantId, body.commissionBps);
  }
```

`Put` est déjà importé en haut du fichier (`import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";`) — aucun changement d'import nécessaire côté `@nestjs/common`.

- [ ] **Step 6: Enregistrer le service dans `offers.module.ts`**

Le fichier `apps/api/src/offers/offers.module.ts` actuel est :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminOffersController } from "./admin-offers.controller";
import { EventSettlementService } from "./event-settlement.service";
import { EventStatsService } from "./event-stats.service";
import { OfferSettingsService } from "./offer-settings.service";
import { OrganizerOffersController } from "./organizer-offers.controller";
import { OrganizerOffersService } from "./organizer-offers.service";
import { OffersCronController } from "./offers-cron.controller";
import { WalletService } from "./wallet.service";
import { WithdrawalsService } from "./withdrawals.service";

@Module({
  imports: [AuthModule],
  controllers: [OrganizerOffersController, AdminOffersController, OffersCronController],
  providers: [
    OfferSettingsService,
    WalletService,
    WithdrawalsService,
    EventStatsService,
    EventSettlementService,
    OrganizerOffersService
  ],
  exports: [OfferSettingsService, WalletService, EventStatsService, EventSettlementService]
})
export class OffersModule {}
```

Remplacer par :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminOffersController } from "./admin-offers.controller";
import { CommissionOverrideService } from "./commission-override.service";
import { EventSettlementService } from "./event-settlement.service";
import { EventStatsService } from "./event-stats.service";
import { OfferSettingsService } from "./offer-settings.service";
import { OrganizerOffersController } from "./organizer-offers.controller";
import { OrganizerOffersService } from "./organizer-offers.service";
import { OffersCronController } from "./offers-cron.controller";
import { WalletService } from "./wallet.service";
import { WithdrawalsService } from "./withdrawals.service";

@Module({
  imports: [AuthModule],
  controllers: [OrganizerOffersController, AdminOffersController, OffersCronController],
  providers: [
    OfferSettingsService,
    WalletService,
    WithdrawalsService,
    EventStatsService,
    EventSettlementService,
    OrganizerOffersService,
    CommissionOverrideService
  ],
  exports: [OfferSettingsService, WalletService, EventStatsService, EventSettlementService]
})
export class OffersModule {}
```

- [ ] **Step 7: Ajouter le fichier de test au script `test:offers`**

Dans `apps/api/package.json`, ajouter `src/offers/commission-override.service.test.ts` à la ligne `"test:offers"` :

```json
    "test:offers": "node --import tsx --test src/offers/offers-cron.controller.test.ts src/offers/offer-commission.test.ts src/payments/psp/fedapay.gateway.test.ts src/offers/wallet.service.test.ts src/offers/offer-settings.service.test.ts src/offers/event-settlement.service.test.ts src/offers/commission-override.service.test.ts",
```

- [ ] **Step 8: Run le typecheck complet**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 9: Run les deux suites de tests API**

Run: `cd apps/api && npm run test:offers && npm test`
Expected: tous les tests passent dans les deux scripts.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/offers/commission-override.service.ts apps/api/src/offers/commission-override.service.test.ts apps/api/src/offers/admin-offers.controller.ts apps/api/src/offers/offers.module.ts apps/api/package.json
git commit -m "feat(admin): add commission override endpoints with floor/ceiling and audit"
```

---

## Post-plan — mise à jour de la documentation

Après les 7 tâches, mettre à jour :
- `docs/superpowers/specs/2026-08-28-settlement-business-plan.md` §12 (roadmap) : marquer F2 comme livré.
- `docs/superpowers/specs/2026-08-28-settlement-module-map.md` : `offers/event-settlement.service.ts` passe de "ACTIF → À SUPPRIMER" à "ACTIF (mode legacy conditionnel)" tant que `offer2PerVoteCommissionEnabled` peut encore être `false` quelque part.
- `docs/adr/ADR-020-settlement-finance-model.md` : statut de "Proposé" à "Accepté" si la revue produit a eu lieu ; sinon laisser en l'état.

Hors scope de ce plan (à planifier séparément) : F3 (cap mid-event dans `withdrawals.service.ts`), F5 (compteur de confiance + détection d'incident, remplace la constante `SETTLEMENT_HELD_BPS_KEY` unique par un calcul par tenant), F4 (UI wallet 3 poches), Tier Standard/Pro sur la commission.
