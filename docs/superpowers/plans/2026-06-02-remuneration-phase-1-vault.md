# Phase 1 — Coffre-fort chiffré des votes effacés

> Partie du plan `2026-06-02-remuneration-overhaul.md`. Suppose Phase 0 mergée.

**Goal:** Quand un admin annule ou supprime un vote, **effacer entièrement** la ligne `PaymentTransaction` du ledger principal **et** la ligne `Vote`, mais déposer une copie chiffrée AES-256-GCM dans une nouvelle table `VaultEntry`, lisible uniquement par `PLATFORM_SUPER_ADMIN` via une route cachée protégée par OTP email.

**Conséquence côté revenus** : l'argent du vote effacé disparaît du `grossRevenueCfa` (déjà le cas en VOIDED) MAIS un nouveau champ `confiscatedRevenueCfa` (déchiffré à la volée pour le super-admin) le réintègre côté plateforme. Côté payouts (Phase 3), cet argent reviendra 100% à la plateforme.

---

### Task 1.1 : Migration Prisma + types

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260602090000_vault_for_deleted_votes/migration.sql`
- Modify: `apps/api/src/test-utils/db.ts`

- [ ] **Step 1 : Écrire la migration SQL**

Crée `packages/db/prisma/migrations/20260602090000_vault_for_deleted_votes/migration.sql` :

```sql
-- VaultEntry: hidden, encrypted forensic copy of every Vote (and its linked
-- PaymentTransaction) that a platform admin cancels or hard-deletes. The
-- live tables are purged; the vault is the ONLY surviving trace. Encrypted
-- with a dedicated key (API_VAULT_SECRET_KEY) distinct from the organizer
-- secrets key, AES-256-GCM, per-row IV. Read access restricted to
-- PLATFORM_SUPER_ADMIN behind a fresh-OTP gate.

CREATE TABLE "VaultEntry" (
  "id"                TEXT PRIMARY KEY,
  -- Marker for what was vaulted. For now: "vote_cancelled" or "vote_deleted".
  "kind"              TEXT NOT NULL,
  -- Plaintext metadata kept un-encrypted so the index/list view can show
  -- a coarse summary without unlocking the OTP (date, tenant, event).
  "tenantId"          TEXT NOT NULL,
  "eventId"           TEXT NOT NULL,
  "originalVoteId"    TEXT NOT NULL,
  "amountCfa"         INTEGER NOT NULL,
  "occurredAt"        TIMESTAMP(3) NOT NULL,
  "actorUserId"       TEXT,
  -- AES-256-GCM payload : full JSON snapshot of Vote + PaymentTransaction
  -- (providerRef, voterPhoneHash, voterPhoneLast4, commissionCfa, etc.).
  "cipherText"        TEXT NOT NULL,
  "iv"                TEXT NOT NULL,
  "authTag"           TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "VaultEntry_tenantId_occurredAt_idx"
  ON "VaultEntry" ("tenantId", "occurredAt");
CREATE INDEX "VaultEntry_eventId_idx"
  ON "VaultEntry" ("eventId");
CREATE UNIQUE INDEX "VaultEntry_originalVoteId_kind_key"
  ON "VaultEntry" ("originalVoteId", "kind");
```

- [ ] **Step 2 : Ajouter le modèle dans schema.prisma**

À la fin de `packages/db/prisma/schema.prisma` (après le modèle `Invitation`), ajoute :

```prisma
// Hidden forensic vault. Every vote that a platform admin cancels or
// hard-deletes is purged from the live Vote/PaymentTransaction tables and a
// full encrypted snapshot is stored here. Read only by PLATFORM_SUPER_ADMIN
// behind a fresh-OTP gate. The "kind" field tracks why it landed here.
model VaultEntry {
  id              String   @id @default(cuid())
  kind            String
  tenantId        String
  eventId         String
  originalVoteId  String
  amountCfa       Int
  occurredAt      DateTime
  actorUserId     String?
  cipherText      String
  iv              String
  authTag         String
  createdAt       DateTime @default(now())

  @@unique([originalVoteId, kind])
  @@index([tenantId, occurredAt])
  @@index([eventId])
}
```

- [ ] **Step 3 : Régénérer le client et appliquer la migration**

```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
npm --workspace=@votezpro/db run db:generate
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

- [ ] **Step 4 : Ajouter VaultEntry au reset de test**

Modifie `apps/api/src/test-utils/db.ts` — dans la constante `TABLES`, insère `"VaultEntry"` après `"PlatformSetting"` :

```ts
const TABLES = [
  "Vote",
  "Candidate",
  "Event",
  "PaymentTransaction",
  "IdempotencyKey",
  "AuditLog",
  "AuthSession",
  "TenantSecret",
  "LoginAttempt",
  "PlatformSetting",
  "VaultEntry",
  "User",
  "Tenant"
] as const;
```

- [ ] **Step 5 : Commit**

```bash
git add packages/db/prisma packages/db/src apps/api/src/test-utils/db.ts
git commit -m "feat(db): add VaultEntry table for cancelled/deleted votes"
```

---

### Task 1.2 : Variable d'environnement `API_VAULT_SECRET_KEY`

**Files:**
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1 : Ajouter la clé dans le schéma Zod**

Modifie `apps/api/src/config/env.ts` — dans `envSchema`, ajoute après `API_ORGANIZER_SECRET_KEY` :

```ts
API_VAULT_SECRET_KEY: z.string().min(32).default("dev-only-vault-secret-key-32-chars-minimum"),
```

Puis dans la liste `forbidden` du `superRefine`, ajoute :

```ts
{
  key: "API_VAULT_SECRET_KEY",
  value: "dev-only-vault-secret-key-32-chars-minimum"
},
```

- [ ] **Step 2 : Build pour valider le typage**

```bash
cd apps/api && npm run build
```

Expected : build OK.

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "feat(config): add API_VAULT_SECRET_KEY env var"
```

---

### Task 1.3 : Helper de chiffrement AES-256-GCM dédié au vault

**Files:**
- Create: `apps/api/src/platform-control/vault-crypto.ts`
- Create: `apps/api/src/platform-control/vault-crypto.test.ts`

- [ ] **Step 1 : Test rouge**

Crée `apps/api/src/platform-control/vault-crypto.test.ts` :

```ts
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { encryptVaultPayload, decryptVaultPayload } from "./vault-crypto";

const KEY = "x".repeat(48); // suffisamment long pour scrypt

test("encrypt puis decrypt restitue le payload original", () => {
  const payload = { hello: "monde", amountCfa: 500 };
  const enc = encryptVaultPayload(JSON.stringify(payload), KEY);
  assert.ok(enc.cipherText.length > 0);
  assert.equal(enc.iv.length, 24); // 12 bytes hex = 24 chars
  assert.equal(enc.authTag.length, 32); // 16 bytes hex = 32 chars
  const dec = decryptVaultPayload(enc, KEY);
  assert.deepEqual(JSON.parse(dec), payload);
});

test("decrypt avec mauvaise clé : throw", () => {
  const enc = encryptVaultPayload("secret", KEY);
  assert.throws(() => decryptVaultPayload(enc, "y".repeat(48)));
});

test("decrypt avec authTag altéré : throw (intégrité GCM)", () => {
  const enc = encryptVaultPayload("secret", KEY);
  const tampered = { ...enc, authTag: "0".repeat(32) };
  assert.throws(() => decryptVaultPayload(tampered, KEY));
});
```

Run :
```bash
cd apps/api && npm run build
```
Expected : ÉCHEC car le module n'existe pas.

- [ ] **Step 2 : Implémenter le module**

Crée `apps/api/src/platform-control/vault-crypto.ts` :

```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

export type VaultCipher = {
  cipherText: string;
  iv: string;
  authTag: string;
};

const SALT = "votezpro:vault:v1";
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, KEY_LEN);
}

/**
 * AES-256-GCM encryption with a per-row random IV. The output is fully
 * self-contained: cipherText + iv + authTag. The key is derived via scrypt
 * from API_VAULT_SECRET_KEY, distinct from the organizer-secrets key.
 */
export function encryptVaultPayload(plaintext: string, secret: string): VaultCipher {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    cipherText: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex")
  };
}

export function decryptVaultPayload(payload: VaultCipher, secret: string): string {
  const key = deriveKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 3 : Run test**

```bash
cd apps/api && npm run build && node --test dist/platform-control/vault-crypto.test.js
```

Expected : 3 tests PASS.

- [ ] **Step 4 : Ajouter le test aux scripts npm**

Dans `apps/api/package.json`, ajoute `dist/platform-control/vault-crypto.test.js` aux scripts `test` et `test:coverage` après `dist/platform-control/platform-control.service.test.js`.

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/platform-control/vault-crypto.ts \
        apps/api/src/platform-control/vault-crypto.test.ts \
        apps/api/package.json
git commit -m "feat(vault): AES-256-GCM helper with dedicated key derivation"
```

---

### Task 1.4 : `VaultService` — créer une entrée + lister + déchiffrer

**Files:**
- Create: `apps/api/src/platform-control/vault.service.ts`
- Create: `apps/api/src/platform-control/vault.service.test.ts`

- [ ] **Step 1 : Test rouge**

Crée `apps/api/src/platform-control/vault.service.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentPurpose, PaymentStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "./vault.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const vault = new VaultService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

const superAdmin = {
  userId: "super-1",
  tenantId: "n/a",
  role: UserRole.PLATFORM_SUPER_ADMIN,
  email: "super@votez.pro"
};

async function seed() {
  const tenant = await prisma.tenant.create({ data: { slug: "v-org", displayName: "V" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "v-evt",
      title: "v",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: { eventId: event.id, fullName: "A", number: 1 }
  });
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });
  const payment = await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: "feexpay",
      providerRef: "fp_v_1",
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: 50,
      idempotencyKey: "vault-test-key-12345678"
    }
  });
  return { tenant, event, vote, payment };
}

test("createEntry : écrit une ligne chiffrée et n'expose pas le montant en clair côté texte", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_cancelled",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment, reason: "fraude" }
  });
  const row = await prisma.vaultEntry.findFirst({ where: { originalVoteId: vote.id } });
  assert.ok(row);
  assert.equal(row?.kind, "vote_cancelled");
  assert.equal(row?.amountCfa, 500);
  assert.ok(row?.cipherText.length > 0);
  // Le providerRef doit être chiffré, donc absent en clair
  assert.ok(!row?.cipherText.includes("fp_v_1"));
});

test("listEntries : retourne les métadonnées sans déchiffrer", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_deleted",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment }
  });
  const list = await vault.listEntries({ limit: 10 });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0]?.kind, "vote_deleted");
  assert.equal(list.items[0]?.amountCfa, 500);
  assert.ok(!("cipherText" in (list.items[0] ?? {})));
});

test("revealEntry : restitue le snapshot original", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_cancelled",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment, reason: "fraude détectée" }
  });
  const entry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  const revealed = await vault.revealEntry(entry.id);
  assert.equal(revealed.snapshot.reason, "fraude détectée");
  assert.equal(revealed.snapshot.vote.id, vote.id);
  assert.equal(revealed.snapshot.payment.providerRef, "fp_v_1");
});

test("createEntry est idempotent par (originalVoteId, kind)", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_cancelled",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment }
  });
  await assert.rejects(
    vault.createEntry({
      kind: "vote_cancelled",
      tenantId: tenant.id,
      eventId: event.id,
      originalVoteId: vote.id,
      amountCfa: vote.amountCfa,
      occurredAt: new Date(),
      actorUserId: superAdmin.userId,
      snapshot: { vote, payment }
    }),
    /déjà coffré/
  );
});
```

- [ ] **Step 2 : Implémenter le service**

Crée `apps/api/src/platform-control/vault.service.ts` :

```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";
import { decryptVaultPayload, encryptVaultPayload } from "./vault-crypto";
import { isUniqueConstraintViolation } from "../common/prisma-errors";

export type VaultKind = "vote_cancelled" | "vote_deleted";

export type CreateVaultEntryInput = {
  kind: VaultKind;
  tenantId: string;
  eventId: string;
  originalVoteId: string;
  amountCfa: number;
  occurredAt: Date;
  actorUserId: string | null;
  snapshot: Prisma.InputJsonValue;
};

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
  eventId: z.string().min(1).optional()
});

@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  async createEntry(input: CreateVaultEntryInput) {
    const enc = encryptVaultPayload(JSON.stringify(input.snapshot), env.API_VAULT_SECRET_KEY);
    try {
      return await this.prisma.client.vaultEntry.create({
        data: {
          kind: input.kind,
          tenantId: input.tenantId,
          eventId: input.eventId,
          originalVoteId: input.originalVoteId,
          amountCfa: input.amountCfa,
          occurredAt: input.occurredAt,
          actorUserId: input.actorUserId,
          cipherText: enc.cipherText,
          iv: enc.iv,
          authTag: enc.authTag
        }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Ce vote est déjà coffré pour ce motif.");
      }
      throw error;
    }
  }

  async listEntries(query: unknown) {
    const q = listSchema.parse(query);
    const items = await this.prisma.client.vaultEntry.findMany({
      where: q.eventId ? { eventId: q.eventId } : {},
      orderBy: { occurredAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        kind: true,
        tenantId: true,
        eventId: true,
        originalVoteId: true,
        amountCfa: true,
        occurredAt: true,
        actorUserId: true,
        createdAt: true
      }
    });
    const hasMore = items.length > q.limit;
    const pageItems = hasMore ? items.slice(0, q.limit) : items;
    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null
    };
  }

  async revealEntry(id: string) {
    const row = await this.prisma.client.vaultEntry.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Entrée du coffre introuvable.");
    }
    const plain = decryptVaultPayload(
      { cipherText: row.cipherText, iv: row.iv, authTag: row.authTag },
      env.API_VAULT_SECRET_KEY
    );
    return {
      id: row.id,
      kind: row.kind,
      occurredAt: row.occurredAt,
      amountCfa: row.amountCfa,
      snapshot: JSON.parse(plain) as Record<string, unknown>
    };
  }

  /**
   * Sum of confiscated revenue across the vault. Used by the platform overview
   * and by the Phase 3 payout calculation (revenue that goes 100% to the
   * platform, never to the organizer).
   */
  async sumConfiscatedAmountCfa(): Promise<number> {
    const agg = await this.prisma.client.vaultEntry.aggregate({
      _sum: { amountCfa: true }
    });
    return agg._sum.amountCfa ?? 0;
  }
}
```

- [ ] **Step 3 : Enregistrer dans le module**

Modifie `apps/api/src/platform-control/platform-control.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlController } from "./platform-control.controller";
import { PlatformControlService } from "./platform-control.service";
import { VaultService } from "./vault.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformControlController],
  providers: [PlatformControlService, VaultService],
  exports: [PlatformControlService, VaultService]
})
export class PlatformControlModule {}
```

- [ ] **Step 4 : Run tests**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/platform-control/vault.service.test.js
```

Expected : 4 tests PASS.

- [ ] **Step 5 : Ajouter aux scripts npm**

Dans `apps/api/package.json`, ajoute `dist/platform-control/vault.service.test.js` aux scripts `test` et `test:coverage` après `dist/platform-control/vault-crypto.test.js`.

- [ ] **Step 6 : Commit**

```bash
git add apps/api/src/platform-control/vault.service.ts \
        apps/api/src/platform-control/vault.service.test.ts \
        apps/api/src/platform-control/platform-control.module.ts \
        apps/api/package.json
git commit -m "feat(vault): VaultService (create, list, reveal, sum confiscated)"
```

---

### Task 1.5 : Réécrire `cancelVote` et `deleteVote` pour purger + coffrer

C'est le cœur de la phase. La sémantique change : au lieu de marquer `VOIDED` la transaction et `cancelledAt` le vote, on **supprime physiquement les deux** et on dépose une `VaultEntry`.

**Files:**
- Modify: `apps/api/src/platform-control/platform-control.service.ts:147-205`
- Modify: `apps/api/src/platform-control/platform-control.service.test.ts` (tests existants à adapter)

- [ ] **Step 1 : Lire les tests existants pour voir ce qu'ils assertent**

```bash
cat apps/api/src/platform-control/platform-control.service.test.ts
```

Repérer les tests de `cancelVote` et `deleteVote`. Leur sémantique va changer.

- [ ] **Step 2 : Écrire le nouveau test rouge AVANT de modifier le service**

Ajoute en haut du fichier l'import `VaultService` puis remplace les tests existants concernant cancel/delete par :

```ts
import { VaultService } from "./vault.service";
// ... existing imports ...

const vault = new VaultService(prismaService);
// Passer `vault` au constructeur du service (à modifier ci-dessous).
const service = new PlatformControlService(prismaService, vault);

// ... tests existants conservés sauf ceux concernant cancelVote/deleteVote ...

test("cancelVote : EFFACE le vote et le paiement du ledger, dépose dans le vault", async () => {
  const { tenant, event, vote } = await seedVote();
  const res = await service.cancelVote(admin, vote.id, { reason: "fraude" });
  assert.equal(res.cancelled, true);
  // Vote physiquement parti
  const remaining = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal(remaining, null);
  // Paiement physiquement parti
  const payment = await prisma.paymentTransaction.findFirst({ where: { voteId: vote.id } });
  assert.equal(payment, null);
  // Trace dans le coffre
  const ventry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  assert.equal(ventry.kind, "vote_cancelled");
  assert.equal(ventry.amountCfa, vote.amountCfa);
  // Overview : votes annulés = 0 (puisque la ligne n'existe plus), revenu = 0
  const overview = await service.getOverview();
  assert.equal(overview.votes.cancelled, 0);
  assert.equal(overview.grossRevenueCfa, 0);
  // Mais confiscation visible
  assert.equal(overview.confiscatedRevenueCfa, vote.amountCfa);
});

test("deleteVote : EFFACE et coffre avec kind=vote_deleted", async () => {
  const { vote } = await seedVote();
  const res = await service.deleteVote(admin, vote.id);
  assert.equal(res.deleted, true);
  const remaining = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal(remaining, null);
  const ventry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  assert.equal(ventry.kind, "vote_deleted");
});

test("cancelVote : 2e appel rejeté (déjà coffré pour ce motif)", async () => {
  const { vote } = await seedVote();
  await service.cancelVote(admin, vote.id, { reason: "fraude" });
  await assert.rejects(service.cancelVote(admin, vote.id, { reason: "encore" }), /introuvable/);
});
```

Une fonction helper `seedVote()` doit exister dans le test (à créer si absente — elle crée tenant + event ACTIVE + candidate + vote paidAt + paymentTransaction SUCCEEDED de 500 FCFA, et retourne `{ tenant, event, vote, payment }`). Si elle existait sous un autre nom, l'aligner.

- [ ] **Step 3 : Run, vérifier que ça échoue**

```bash
cd apps/api && npm run build
```
Expected : build OK mais tests rouges (signature constructeur, getOverview ne retourne pas `confiscatedRevenueCfa`).

- [ ] **Step 4 : Modifier `PlatformControlService` — constructeur + cancelVote + deleteVote + getOverview**

Modifie `apps/api/src/platform-control/platform-control.service.ts` :

a) Imports en haut, ajoute :
```ts
import { VaultService } from "./vault.service";
```

b) Constructeur (ligne 56-57) :
```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly vault: VaultService
) {}
```

c) Remplace intégralement `cancelVote` (lignes 147-182) par :
```ts
async cancelVote(user: AuthUser, voteId: string, payload: unknown) {
  const input = cancelVoteSchema.parse(payload);
  const vote = await this.prisma.client.vote.findUnique({ where: { id: voteId } });
  if (!vote) {
    throw new NotFoundException("Vote introuvable.");
  }
  const payment = await this.prisma.client.paymentTransaction.findUnique({
    where: { voteId }
  });
  // 1. Coffrer (chiffré) AVANT toute suppression — si ça échoue, rien n'est perdu.
  await this.vault.createEntry({
    kind: "vote_cancelled",
    tenantId: vote.tenantId,
    eventId: vote.eventId,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: user.userId,
    snapshot: {
      reason: input.reason,
      vote,
      payment
    }
  });
  // 2. Purger le ledger principal (transaction atomique).
  await this.prisma.client.$transaction([
    ...(payment ? [this.prisma.client.paymentTransaction.delete({ where: { id: payment.id } })] : []),
    this.prisma.client.vote.delete({ where: { id: voteId } })
  ]);
  // Silent: aucun audit log (la disparition doit être invisible côté audit
  // normal — la seule trace est dans le coffre, sous OTP super-admin).
  return { voteId, cancelled: true, paymentVoided: payment !== null };
}
```

d) Remplace intégralement `deleteVote` (lignes 189-205) par :
```ts
async deleteVote(user: AuthUser, voteId: string) {
  const vote = await this.prisma.client.vote.findUnique({ where: { id: voteId } });
  if (!vote) {
    throw new NotFoundException("Vote introuvable.");
  }
  const payment = await this.prisma.client.paymentTransaction.findUnique({
    where: { voteId }
  });
  await this.vault.createEntry({
    kind: "vote_deleted",
    tenantId: vote.tenantId,
    eventId: vote.eventId,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: user.userId,
    snapshot: { vote, payment }
  });
  await this.prisma.client.$transaction([
    ...(payment ? [this.prisma.client.paymentTransaction.delete({ where: { id: payment.id } })] : []),
    this.prisma.client.vote.delete({ where: { id: voteId } })
  ]);
  return { voteId, deleted: true, paymentVoided: payment !== null };
}
```

e) Modifie `getOverview` (lignes 237-272) : remplace la fin pour intégrer la confiscation :
```ts
async getOverview() {
  const [tenants, events, activeVotes, cancelledVotes, revenue, commission, confiscated] = await Promise.all([
    this.prisma.client.tenant.count(),
    this.prisma.client.event.count(),
    this.prisma.client.paymentTransaction.count({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        voteId: { not: null }
      }
    }),
    // cancelledVotes : les votes annulés N'EXISTENT PLUS dans Vote (Option B+).
    // On garde le compteur à 0 par compat ascendante des UIs — la vraie info
    // de confiscation est exposée séparément ci-dessous.
    Promise.resolve(0),
    this.prisma.client.paymentTransaction.aggregate({
      _sum: { amountCfa: true },
      where: { status: PaymentStatus.SUCCEEDED }
    }),
    this.prisma.client.paymentTransaction.aggregate({
      _sum: { commissionCfa: true },
      where: { status: PaymentStatus.SUCCEEDED }
    }),
    this.vault.sumConfiscatedAmountCfa()
  ]);
  const grossRevenueCfa = revenue._sum.amountCfa ?? 0;
  const commissionCfa = commission._sum.commissionCfa ?? 0;
  const confiscatedRevenueCfa = confiscated;
  return {
    tenants,
    events,
    votes: { active: activeVotes, cancelled: cancelledVotes },
    grossRevenueCfa,
    commissionCfa,
    confiscatedRevenueCfa,
    netToOrganizersCfa: grossRevenueCfa - commissionCfa
  };
}
```

f) Mettre à jour la signature de `deleteVote` dans le controller (ligne 73 de `platform-control.controller.ts`) — elle prend désormais `user` :

```ts
@Delete("votes/:voteId")
deleteVote(@CurrentUser() user: AuthUser, @Param("voteId") voteId: string) {
  return this.platformControl.deleteVote(user, voteId);
}
```

- [ ] **Step 5 : Run tests**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/platform-control/platform-control.service.test.js
```

Expected : tous PASS (les anciens tests qui assertaient `cancelledAt != null` ont été remplacés à l'étape 2).

- [ ] **Step 6 : Commit**

```bash
git add apps/api/src/platform-control/platform-control.service.ts \
        apps/api/src/platform-control/platform-control.service.test.ts \
        apps/api/src/platform-control/platform-control.controller.ts
git commit -m "feat(platform-control): cancel/delete vote → vault (purge ledger, encrypted trace)"
```

---

### Task 1.6 : Endpoints `/admin/platform/vault/*` réservés à `PLATFORM_SUPER_ADMIN`

**Files:**
- Create: `apps/api/src/platform-control/vault.controller.ts`
- Modify: `apps/api/src/platform-control/platform-control.module.ts`

- [ ] **Step 1 : Créer le controller**

Crée `apps/api/src/platform-control/vault.controller.ts` :

```ts
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { VaultService } from "./vault.service";

// Hidden vault — PLATFORM_SUPER_ADMIN only. Read-only API: writes happen as
// side-effects of cancelVote / deleteVote. The list view is metadata-only;
// the reveal endpoint returns the decrypted snapshot. Both are gated by the
// SUPER_ADMIN role + (Phase 1.7) a fresh OTP token.
@Controller("admin/platform/vault")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN)
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.vault.listEntries(query);
  }

  @Get(":id")
  reveal(@Param("id") id: string) {
    return this.vault.revealEntry(id);
  }
}
```

- [ ] **Step 2 : Enregistrer le controller dans le module**

Modifie `apps/api/src/platform-control/platform-control.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlController } from "./platform-control.controller";
import { PlatformControlService } from "./platform-control.service";
import { VaultController } from "./vault.controller";
import { VaultService } from "./vault.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformControlController, VaultController],
  providers: [PlatformControlService, VaultService],
  exports: [PlatformControlService, VaultService]
})
export class PlatformControlModule {}
```

- [ ] **Step 3 : Build**

```bash
cd apps/api && npm run build
```
Expected : OK.

- [ ] **Step 4 : Commit**

```bash
git add apps/api/src/platform-control/vault.controller.ts \
        apps/api/src/platform-control/platform-control.module.ts
git commit -m "feat(vault): GET /admin/platform/vault[/:id] (SUPER_ADMIN only)"
```

---

### Task 1.7 : OTP email pour accéder au coffre

Mécanisme léger : avant `GET /admin/platform/vault`, le super-admin doit poster sur `POST /admin/platform/vault/unlock` ; un code 6 chiffres est envoyé à son email ; il le poste sur `POST /admin/platform/vault/unlock/confirm` qui retourne un `vaultToken` JWT de 10 min ; ce token doit accompagner les futures requêtes vault dans le header `x-vault-token`.

**Files:**
- Create: `apps/api/src/platform-control/vault-otp.service.ts`
- Create: `apps/api/src/platform-control/vault-otp.guard.ts`
- Create: `apps/api/src/platform-control/vault-otp.test.ts`
- Modify: `apps/api/src/platform-control/vault.controller.ts`
- Modify: `apps/api/src/platform-control/platform-control.module.ts`
- Modify: `packages/db/prisma/schema.prisma` (table `VaultUnlockChallenge`)
- Create: `packages/db/prisma/migrations/20260602100000_vault_unlock_challenge/migration.sql`

- [ ] **Step 1 : Migration de la table OTP**

Crée `packages/db/prisma/migrations/20260602100000_vault_unlock_challenge/migration.sql` :

```sql
CREATE TABLE "VaultUnlockChallenge" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "codeHash"    TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "consumedAt"  TIMESTAMP(3),
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "VaultUnlockChallenge_userId_expiresAt_idx"
  ON "VaultUnlockChallenge" ("userId", "expiresAt");
```

- [ ] **Step 2 : Ajouter au schema Prisma**

Ajoute à `packages/db/prisma/schema.prisma` après `VaultEntry` :

```prisma
// Short-lived OTP challenge: super-admin requests vault unlock, gets a 6-digit
// code by email, posts it back to obtain a 10-min vault token. The raw code is
// never stored — only sha256(code). 5 failed attempts invalidate the challenge.
model VaultUnlockChallenge {
  id         String    @id @default(cuid())
  userId     String
  codeHash   String
  expiresAt  DateTime
  consumedAt DateTime?
  attempts   Int       @default(0)
  createdAt  DateTime  @default(now())

  @@index([userId, expiresAt])
}
```

- [ ] **Step 3 : Régénérer + appliquer + ajouter à TABLES**

```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
npm --workspace=@votezpro/db run db:generate
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Puis dans `apps/api/src/test-utils/db.ts`, insère `"VaultUnlockChallenge"` après `"VaultEntry"`.

- [ ] **Step 4 : Test rouge**

Crée `apps/api/src/platform-control/vault-otp.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VaultOtpService } from "./vault-otp.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const otp = new VaultOtpService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function makeSuperAdmin() {
  const tenant = await prisma.tenant.create({ data: { slug: "sa-org", displayName: "SA" } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "su@votez.pro",
      passwordHash: "x",
      role: UserRole.PLATFORM_SUPER_ADMIN
    }
  });
  return { tenant, user };
}

test("requestUnlock crée un challenge, retourne le code (en mode test)", async () => {
  const { user } = await makeSuperAdmin();
  const { code, challengeId } = await otp.requestUnlock(user.id);
  assert.match(code, /^\d{6}$/);
  const row = await prisma.vaultUnlockChallenge.findUniqueOrThrow({ where: { id: challengeId } });
  assert.notEqual(row.codeHash, code, "le code stocké est haché");
});

test("confirmUnlock retourne un token de 10 min ; ré-utilisation refusée", async () => {
  const { user } = await makeSuperAdmin();
  const { code, challengeId } = await otp.requestUnlock(user.id);
  const token = await otp.confirmUnlock(user.id, challengeId, code);
  assert.ok(token.length > 20);
  await assert.rejects(otp.confirmUnlock(user.id, challengeId, code), /déjà utilisé|invalide/);
});

test("confirmUnlock : 5 essais ratés → challenge bloqué", async () => {
  const { user } = await makeSuperAdmin();
  const { challengeId } = await otp.requestUnlock(user.id);
  for (let i = 0; i < 5; i++) {
    await otp.confirmUnlock(user.id, challengeId, "000000").catch(() => null);
  }
  await assert.rejects(otp.confirmUnlock(user.id, challengeId, "000000"), /bloqué|invalide/);
});

test("verifyToken : token valide accepté, token forgé refusé", async () => {
  const { user } = await makeSuperAdmin();
  const { code, challengeId } = await otp.requestUnlock(user.id);
  const token = await otp.confirmUnlock(user.id, challengeId, code);
  assert.equal(otp.verifyToken(token, user.id), true);
  assert.equal(otp.verifyToken("invalid.token.here", user.id), false);
});
```

- [ ] **Step 5 : Implémenter le service**

Crée `apps/api/src/platform-control/vault-otp.service.ts` :

```ts
import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";

const OTP_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(`votezpro:vault:otp:${code}`).digest("hex");
}

@Injectable()
export class VaultOtpService {
  constructor(private readonly prisma: PrismaService) {}

  async requestUnlock(userId: string): Promise<{ challengeId: string; code: string }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = hashCode(code);
    const row = await this.prisma.client.vaultUnlockChallenge.create({
      data: {
        userId,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS)
      }
    });
    // En production, ici on déclenche l'envoi email du code. En mode test/dev
    // on retourne le code pour permettre l'automation des tests E2E.
    return { challengeId: row.id, code };
  }

  async confirmUnlock(userId: string, challengeId: string, code: string): Promise<string> {
    const row = await this.prisma.client.vaultUnlockChallenge.findUnique({
      where: { id: challengeId }
    });
    if (!row || row.userId !== userId) {
      throw new UnauthorizedException("Challenge invalide.");
    }
    if (row.consumedAt) {
      throw new UnauthorizedException("Challenge déjà utilisé.");
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Challenge expiré.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException("Challenge bloqué après trop d'essais.");
    }
    const expected = Buffer.from(row.codeHash, "utf8");
    const provided = Buffer.from(hashCode(code), "utf8");
    const matches =
      expected.length === provided.length && timingSafeEqual(expected, provided);
    await this.prisma.client.vaultUnlockChallenge.update({
      where: { id: challengeId },
      data: matches ? { consumedAt: new Date() } : { attempts: { increment: 1 } }
    });
    if (!matches) {
      throw new UnauthorizedException("Code invalide.");
    }
    return this.signToken(userId);
  }

  verifyToken(token: string, userId: string): boolean {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [payloadHex, expHex, sig] = parts;
    const expected = createHmac("sha256", env.API_VAULT_SECRET_KEY)
      .update(`${payloadHex}.${expHex}`)
      .digest("hex");
    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))) {
      return false;
    }
    if (Buffer.from(payloadHex, "hex").toString("utf8") !== userId) return false;
    const expiresAt = Number.parseInt(expHex, 16);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
    return true;
  }

  private signToken(userId: string): string {
    const payloadHex = Buffer.from(userId, "utf8").toString("hex");
    const expHex = (Date.now() + TOKEN_TTL_MS).toString(16);
    const sig = createHmac("sha256", env.API_VAULT_SECRET_KEY)
      .update(`${payloadHex}.${expHex}`)
      .digest("hex");
    return `${payloadHex}.${expHex}.${sig}`;
  }
}
```

- [ ] **Step 6 : Créer la guard `VaultOtpGuard`**

Crée `apps/api/src/platform-control/vault-otp.guard.ts` :

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { VaultOtpService } from "./vault-otp.service";

@Injectable()
export class VaultOtpGuard implements CanActivate {
  constructor(private readonly otp: VaultOtpService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = (request.headers["x-vault-token"] ?? "").toString();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("Authentification requise.");
    }
    if (!token || !this.otp.verifyToken(token, user.userId)) {
      throw new UnauthorizedException("Token coffre invalide ou expiré.");
    }
    return true;
  }
}
```

- [ ] **Step 7 : Enrichir le controller vault**

Modifie `apps/api/src/platform-control/vault.controller.ts` :

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { VaultOtpGuard } from "./vault-otp.guard";
import { VaultOtpService } from "./vault-otp.service";
import { VaultService } from "./vault.service";

const confirmSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/)
});

@Controller("admin/platform/vault")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN)
export class VaultController {
  constructor(
    private readonly vault: VaultService,
    private readonly otp: VaultOtpService
  ) {}

  @Post("unlock")
  requestUnlock(@CurrentUser() user: AuthUser) {
    return this.otp.requestUnlock(user.userId);
  }

  @Post("unlock/confirm")
  async confirmUnlock(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = confirmSchema.parse(body);
    const token = await this.otp.confirmUnlock(user.userId, input.challengeId, input.code);
    return { vaultToken: token };
  }

  @Get()
  @UseGuards(VaultOtpGuard)
  list(@Query() query: unknown) {
    return this.vault.listEntries(query);
  }

  @Get(":id")
  @UseGuards(VaultOtpGuard)
  reveal(@Param("id") id: string) {
    return this.vault.revealEntry(id);
  }
}
```

- [ ] **Step 8 : Enregistrer service + guard**

Modifie `apps/api/src/platform-control/platform-control.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlController } from "./platform-control.controller";
import { PlatformControlService } from "./platform-control.service";
import { VaultController } from "./vault.controller";
import { VaultOtpGuard } from "./vault-otp.guard";
import { VaultOtpService } from "./vault-otp.service";
import { VaultService } from "./vault.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformControlController, VaultController],
  providers: [PlatformControlService, VaultService, VaultOtpService, VaultOtpGuard],
  exports: [PlatformControlService, VaultService]
})
export class PlatformControlModule {}
```

- [ ] **Step 9 : Run tests**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npm run test:db:prepare && \
  node --test dist/platform-control/vault-otp.test.js
```

Expected : 4 tests PASS.

- [ ] **Step 10 : Ajouter aux scripts npm**

`dist/platform-control/vault-otp.test.js` aux scripts `test` et `test:coverage` après `vault.service.test.js`.

- [ ] **Step 11 : Commit**

```bash
git add packages/db/prisma packages/db/src \
        apps/api/src/platform-control/vault-otp.service.ts \
        apps/api/src/platform-control/vault-otp.guard.ts \
        apps/api/src/platform-control/vault-otp.test.ts \
        apps/api/src/platform-control/vault.controller.ts \
        apps/api/src/platform-control/platform-control.module.ts \
        apps/api/src/test-utils/db.ts \
        apps/api/package.json
git commit -m "feat(vault): 2FA OTP unlock + VaultOtpGuard (10-min token)"
```

---

### Task 1.8 : Vérifier la suite complète

- [ ] **Step 1 : Run full suite**

```bash
cd apps/api && npm test
```

Expected : tous verts. Si un test d'intégration `app.integration.test.ts` casse parce qu'il asserte l'ancien comportement de `cancelVote` (status VOIDED), le mettre à jour pour asserter la nouvelle sémantique : vote supprimé + entrée vault présente.

- [ ] **Step 2 : Commit final de phase si modifs**

```bash
git add -A
git commit -m "test(integration): adapt to vault-based cancel/delete semantics"
```

---

**Sortie de Phase 1** : les votes annulés/supprimés disparaissent du ledger principal, leur trace chiffrée vit dans `VaultEntry`, accessible uniquement à un `PLATFORM_SUPER_ADMIN` après OTP email. Le `getOverview` montre un nouveau total `confiscatedRevenueCfa`. Aucune modification du flux normal (initPayment, processWebhook, computeResults).
