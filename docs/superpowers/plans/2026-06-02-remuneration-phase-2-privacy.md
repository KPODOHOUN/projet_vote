# Phase 2 — Politique de confidentialité & consentement traçable

> Partie du plan `2026-06-02-remuneration-overhaul.md`. Suppose Phases 0-1 mergées.

**Goal:** Servir une page publique de politique de confidentialité avec versioning, exiger que chaque `castVote` arrive avec un `privacyConsentVersion` correspondant à la version courante, et tracer chaque consentement dans une nouvelle table `PrivacyConsent` (horodaté, lié au hash du téléphone votant).

---

### Task 2.1 : Migration `PrivacyConsent`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260602110000_privacy_consent/migration.sql`
- Modify: `apps/api/src/test-utils/db.ts`

- [ ] **Step 1 : Migration SQL**

Crée `packages/db/prisma/migrations/20260602110000_privacy_consent/migration.sql` :

```sql
-- Privacy consent ledger. Every public vote MUST be preceded by a recorded
-- consent against the current PrivacyPolicy version. Stored independently
-- of Vote (no FK) so a deleted vote does not orphan the legal proof.
CREATE TABLE "PrivacyConsent" (
  "id"               TEXT PRIMARY KEY,
  "policyVersion"    TEXT NOT NULL,
  "voterPhoneHash"   TEXT NOT NULL,
  "tenantSlug"       TEXT NOT NULL,
  "eventSlug"        TEXT NOT NULL,
  "userAgent"        TEXT,
  "ipHash"           TEXT,
  "acceptedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PrivacyConsent_voterPhoneHash_idx"
  ON "PrivacyConsent" ("voterPhoneHash");
CREATE INDEX "PrivacyConsent_tenantSlug_eventSlug_idx"
  ON "PrivacyConsent" ("tenantSlug", "eventSlug");
CREATE INDEX "PrivacyConsent_acceptedAt_idx"
  ON "PrivacyConsent" ("acceptedAt");
```

- [ ] **Step 2 : Ajouter au schema.prisma**

Ajoute après `VaultUnlockChallenge` :

```prisma
// Tracked acceptance of the public privacy policy. Recorded BEFORE a vote is
// cast (POST /api/v1/privacy/consent), keyed by the voter phone hash so a
// later vote can require a recent consent for that hash. No FK to Vote so the
// legal proof survives vault purges.
model PrivacyConsent {
  id              String   @id @default(cuid())
  policyVersion   String
  voterPhoneHash  String
  tenantSlug      String
  eventSlug       String
  userAgent       String?
  ipHash          String?
  acceptedAt      DateTime @default(now())

  @@index([voterPhoneHash])
  @@index([tenantSlug, eventSlug])
  @@index([acceptedAt])
}
```

- [ ] **Step 3 : Régénérer + appliquer + ajouter au TABLES**

```bash
cd "/home/triple-v/Documents/Projets Personnels/Plateforme de vote"
npm --workspace=@votezpro/db run db:generate
DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Dans `apps/api/src/test-utils/db.ts`, ajoute `"PrivacyConsent"` après `"VaultUnlockChallenge"`.

- [ ] **Step 4 : Commit**

```bash
git add packages/db/prisma packages/db/src apps/api/src/test-utils/db.ts
git commit -m "feat(db): add PrivacyConsent table"
```

---

### Task 2.2 : Document Markdown de la politique + constante de version

**Files:**
- Create: `docs/legal/privacy-policy-v1.md`
- Create: `apps/api/src/privacy/privacy-policy.ts`

- [ ] **Step 1 : Rédiger la politique**

Crée `docs/legal/privacy-policy-v1.md` :

```markdown
# Politique de confidentialité — VotezPro

**Version : 1.0**
**Date d'effet : 2 juin 2026**

## 1. Données collectées

Lorsqu'un votant participe à un événement sur VotezPro, nous collectons :
- **Numéro de téléphone** : utilisé uniquement sous forme de **hash salé SHA-256**, jamais en clair. Les 4 derniers chiffres sont conservés pour faciliter le support.
- **Référence de paiement FeexPay** : pour rapprocher chaque vote du paiement Mobile Money correspondant.
- **Horodatage** et **événement concerné**.

Pour les organisateurs :
- **Email** et **structure** (nom de l'organisation).
- **Logs d'activité** (création d'événements, modifications, paiements).

## 2. Finalités

- Permettre le vote payant et son décompte fiable.
- Encaisser les paiements via FeexPay.
- Prévenir la fraude.
- Respecter les obligations légales (BCEAO, RGPD pour les ressortissants UE).

## 3. Protection

- Numéros de téléphone hachés (impossibles à recalculer en clair).
- Secrets de paiement chiffrés AES-256-GCM.
- Isolation stricte entre organisateurs (un organisateur n'accède jamais aux données d'un autre).
- Communications HTTPS uniquement.

## 4. Durée de conservation

- Données de vote : durée de l'événement + 13 mois (obligation comptable BCEAO).
- Logs d'audit : 12 mois minimum.
- Suppression automatique au-delà.

## 5. Vos droits

Tout votant peut demander à `privacy@votezpro.bj` :
- Une copie des données le concernant.
- La suppression de ces données (RGPD, droit à l'oubli).

Les organisateurs disposent d'un export complet via leur espace personnel.

## 6. Sous-traitants

- **FeexPay** (Bénin) : traitement des paiements Mobile Money.
- **Cloud d'hébergement** : voir page "À propos" pour le détail.

## 7. Contact

Délégué protection des données : `privacy@votezpro.bj`
```

- [ ] **Step 2 : Constante de version côté code**

Crée `apps/api/src/privacy/privacy-policy.ts` :

```ts
// Bump this constant + ship a new docs/legal/privacy-policy-v<N>.md whenever
// the policy changes. The Phase 2 consent check rejects any vote whose
// consent was recorded against a previous version.
export const CURRENT_PRIVACY_POLICY_VERSION = "1.0";
```

- [ ] **Step 3 : Commit**

```bash
git add docs/legal apps/api/src/privacy/privacy-policy.ts
git commit -m "docs(privacy): privacy policy v1.0 + version constant"
```

---

### Task 2.3 : `PrivacyConsentService` — enregistrer & vérifier un consentement

**Files:**
- Create: `apps/api/src/privacy/privacy-consent.service.ts`
- Create: `apps/api/src/privacy/privacy-consent.service.test.ts`
- Modify: `apps/api/src/privacy/privacy.module.ts`

- [ ] **Step 1 : Test rouge**

Crée `apps/api/src/privacy/privacy-consent.service.test.ts` :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { PrivacyConsentService } from "./privacy-consent.service";
import { CURRENT_PRIVACY_POLICY_VERSION } from "./privacy-policy";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const consent = new PrivacyConsentService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("recordConsent persiste avec la version courante", async () => {
  const r = await consent.recordConsent({
    voterPhone: "+229 90 11 22 33",
    tenantSlug: "abc",
    eventSlug: "evt",
    userAgent: "Test/1",
    ipAddress: "10.0.0.1"
  });
  assert.equal(r.policyVersion, CURRENT_PRIVACY_POLICY_VERSION);
  const row = await prisma.privacyConsent.findFirstOrThrow();
  assert.equal(row.policyVersion, CURRENT_PRIVACY_POLICY_VERSION);
  assert.equal(row.tenantSlug, "abc");
  assert.notEqual(row.voterPhoneHash, "+229 90 11 22 33", "phone hashed");
  assert.notEqual(row.ipHash, "10.0.0.1", "ip hashed");
});

test("assertRecentConsent : OK si consent récent même version", async () => {
  await consent.recordConsent({
    voterPhone: "+229 91 22 33 44",
    tenantSlug: "abc",
    eventSlug: "evt"
  });
  await consent.assertRecentConsent("+229 91 22 33 44", "abc", "evt");
});

test("assertRecentConsent : ERREUR si pas de consent", async () => {
  await assert.rejects(
    consent.assertRecentConsent("+229 99 88 77 66", "abc", "evt"),
    /consent/i
  );
});

test("assertRecentConsent : ERREUR si version périmée", async () => {
  // On crée un consent à la main avec une vieille version
  await prisma.privacyConsent.create({
    data: {
      policyVersion: "0.1",
      voterPhoneHash: "fake",
      tenantSlug: "abc",
      eventSlug: "evt"
    }
  });
  await assert.rejects(
    consent.assertRecentConsent("+229 92 33 44 55", "abc", "evt"),
    /consent/i
  );
});
```

- [ ] **Step 2 : Implémenter le service**

Crée `apps/api/src/privacy/privacy-consent.service.ts` :

```ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { hashVoterPhone } from "../common/voter-phone";
import { CURRENT_PRIVACY_POLICY_VERSION } from "./privacy-policy";

const recordSchema = z.object({
  voterPhone: z.string().min(8).max(20),
  tenantSlug: z.string().min(3).max(80),
  eventSlug: z.string().min(3).max(80),
  userAgent: z.string().max(500).optional(),
  ipAddress: z.string().max(64).optional()
});

const CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashIp(ip: string): string {
  return createHash("sha256").update(`votezpro:ip:${ip}`).digest("hex");
}

@Injectable()
export class PrivacyConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async recordConsent(payload: unknown) {
    const input = recordSchema.parse(payload);
    const row = await this.prisma.client.privacyConsent.create({
      data: {
        policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
        voterPhoneHash: hashVoterPhone(input.voterPhone),
        tenantSlug: input.tenantSlug.toLowerCase(),
        eventSlug: input.eventSlug.toLowerCase(),
        userAgent: input.userAgent ?? null,
        ipHash: input.ipAddress ? hashIp(input.ipAddress) : null
      }
    });
    return {
      id: row.id,
      policyVersion: row.policyVersion,
      acceptedAt: row.acceptedAt.toISOString()
    };
  }

  /**
   * Enforced at vote-cast time. The voter must have accepted the CURRENT
   * version within the last 30 days for this (tenant, event). Older or
   * version-mismatched consents are rejected — the UI must re-prompt.
   */
  async assertRecentConsent(
    voterPhone: string,
    tenantSlug: string,
    eventSlug: string
  ): Promise<void> {
    const hash = hashVoterPhone(voterPhone);
    const row = await this.prisma.client.privacyConsent.findFirst({
      where: {
        voterPhoneHash: hash,
        tenantSlug: tenantSlug.toLowerCase(),
        eventSlug: eventSlug.toLowerCase(),
        policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
        acceptedAt: { gte: new Date(Date.now() - CONSENT_TTL_MS) }
      },
      orderBy: { acceptedAt: "desc" }
    });
    if (!row) {
      throw new ForbiddenException(
        "Consent à la politique de confidentialité requis (version courante)."
      );
    }
  }
}
```

- [ ] **Step 3 : Enregistrer dans le module privacy**

Modifie `apps/api/src/privacy/privacy.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrivacyController } from "./privacy.controller";
import { PrivacyConsentService } from "./privacy-consent.service";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [AuthModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, PrivacyConsentService],
  exports: [PrivacyConsentService]
})
export class PrivacyModule {}
```

- [ ] **Step 4 : Run tests**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/privacy/privacy-consent.service.test.js
```

Expected : 4 PASS.

- [ ] **Step 5 : Ajouter aux scripts npm**

Dans `apps/api/package.json`, ajoute `dist/privacy/privacy-consent.service.test.js` aux scripts `test` et `test:coverage` après `privacy.service.test.js`.

- [ ] **Step 6 : Commit**

```bash
git add apps/api/src/privacy/privacy-consent.service.ts \
        apps/api/src/privacy/privacy-consent.service.test.ts \
        apps/api/src/privacy/privacy.module.ts \
        apps/api/package.json
git commit -m "feat(privacy): PrivacyConsentService (record + assertRecent)"
```

---

### Task 2.4 : Endpoints publics consent + policy version

**Files:**
- Modify: `apps/api/src/privacy/privacy.controller.ts`

- [ ] **Step 1 : Ajouter `GET /privacy/policy` (public) et `POST /privacy/consent` (public)**

Modifie `apps/api/src/privacy/privacy.controller.ts` — remplace son contenu par :

```ts
import { Body, Controller, Delete, Get, Header, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PrivacyConsentService } from "./privacy-consent.service";
import { CURRENT_PRIVACY_POLICY_VERSION } from "./privacy-policy";
import { PrivacyService } from "./privacy.service";

@Controller("privacy")
export class PrivacyController {
  constructor(
    private readonly privacyService: PrivacyService,
    private readonly consentService: PrivacyConsentService
  ) {}

  // PUBLIC : version courante de la politique. Servie pour que le frontend
  // puisse comparer côté client la version qu'il affiche.
  @Get("policy")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  getPolicyVersion() {
    return { version: CURRENT_PRIVACY_POLICY_VERSION };
  }

  // PUBLIC : un votant accepte la politique avant de voter. Le résultat
  // (acceptedAt + version) est l'élément que le front mémorise pour l'envoyer
  // au cast vote suivant.
  @Post("consent")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  recordConsent(@Req() req: Request, @Body() body: unknown) {
    const userAgent = req.headers["user-agent"]?.toString();
    const ipAddress = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.ip ?? "")
      .trim()
      .slice(0, 64);
    return this.consentService.recordConsent({
      ...((body as Record<string, unknown>) ?? {}),
      userAgent,
      ipAddress
    });
  }

  // AUTHENTIFIÉ : exports / RGPD existants (inchangés)
  @Get("export")
  @Header("Content-Type", "application/zip")
  @UseGuards(AuthGuard)
  async exportUserData(@CurrentUser() user: AuthUser, @Res() response: Response) {
    const archive = await this.privacyService.buildUserExportArchive(user);
    const datePart = new Date().toISOString().slice(0, 10);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="votezpro-export-${datePart}.zip"`
    );
    response.send(archive);
  }

  @Delete("delete")
  @UseGuards(AuthGuard)
  deleteUserData(@CurrentUser() user: AuthUser) {
    return this.privacyService.anonymizeUserData(user);
  }
}
```

- [ ] **Step 2 : Build**

```bash
cd apps/api && npm run build
```

Expected : OK.

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/privacy/privacy.controller.ts
git commit -m "feat(privacy): public GET /privacy/policy + POST /privacy/consent"
```

---

### Task 2.5 : Brancher la vérification de consent dans `castVote`

**Files:**
- Modify: `apps/api/src/votes/votes.service.ts`
- Modify: `apps/api/src/votes/votes.module.ts`

- [ ] **Step 1 : Test rouge**

Ajoute à la fin de `apps/api/src/votes/votes.service.test.ts` (à lire d'abord) :

```ts
test("castVote : refuse sans consent privacy enregistré", async () => {
  // setup tenant + event ACTIVE + candidate (cf. helper existant dans le test)
  const { tenant, event, candidate } = await activeEventWithCandidate();
  await assert.rejects(
    votes.castVote({
      tenantSlug: tenant.slug,
      eventSlug: event.slug,
      candidateNumber: candidate.number,
      amountCfa: 500,
      voterPhone: "+229 95 00 00 01"
    }),
    /Consent/i
  );
});

test("castVote : OK après recordConsent", async () => {
  const { tenant, event, candidate } = await activeEventWithCandidate();
  await consentService.recordConsent({
    voterPhone: "+229 95 00 00 02",
    tenantSlug: tenant.slug,
    eventSlug: event.slug
  });
  const vote = await votes.castVote({
    tenantSlug: tenant.slug,
    eventSlug: event.slug,
    candidateNumber: candidate.number,
    amountCfa: 500,
    voterPhone: "+229 95 00 00 02"
  });
  assert.ok(vote.id);
});
```

(Si `votes.service.test.ts` n'a pas encore le helper `activeEventWithCandidate` ni le `consentService`, les ajouter en début de fichier ; instancier `consentService = new PrivacyConsentService(prismaService)`.)

- [ ] **Step 2 : Modifier `VotesService` pour injecter et appeler le service**

Modifie `apps/api/src/votes/votes.service.ts` :

a) Ajouter import :
```ts
import { PrivacyConsentService } from "../privacy/privacy-consent.service";
```

b) Constructeur :
```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly consentService: PrivacyConsentService
) {}
```

c) Dans `castVote`, juste après la validation `castVoteSchema.parse` (avant tout le reste, donc avant la résolution du tenant) :
```ts
const input = castVoteSchema.parse(payload);
// Refuse tout vote sans consent récent à la politique courante.
await this.consentService.assertRecentConsent(
  input.voterPhone,
  input.tenantSlug,
  input.eventSlug
);
```

- [ ] **Step 3 : Module — importer PrivacyModule**

Modifie `apps/api/src/votes/votes.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { PrivacyModule } from "../privacy/privacy.module";
import { VotesController } from "./votes.controller";
import { VotesService } from "./votes.service";

@Module({
  imports: [PrivacyModule],
  controllers: [VotesController],
  providers: [VotesService],
  exports: [VotesService]
})
export class VotesModule {}
```

- [ ] **Step 4 : Run tests**

```bash
cd apps/api && npm run build && \
  DATABASE_URL="postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test" \
  node --test dist/votes/votes.service.test.js dist/votes/webhook-gate.test.js
```

Expected : nouveaux tests PASS, anciens toujours verts (les anciens helpers de cast utilisent peut-être un teléphone non-consenti — il faut ajouter un `await consentService.recordConsent(...)` dans le helper commun de seed des votes existants).

- [ ] **Step 5 : Mettre à jour `app.integration.test.ts` pour appeler `POST /api/v1/privacy/consent` avant chaque `POST /api/v1/votes/cast`**

Repère chaque `request(...).post("/api/v1/votes/cast")` et précède-le par :
```ts
await request(app.getHttpServer())
  .post("/api/v1/privacy/consent")
  .send({
    voterPhone: "+229 95 00 00 99",
    tenantSlug: "<le-slug>",
    eventSlug: "<le-slug>"
  })
  .expect(201);
```

Le téléphone doit être identique à celui utilisé ensuite dans le cast.

- [ ] **Step 6 : Run la suite complète**

```bash
cd apps/api && npm test
```

Expected : tout vert.

- [ ] **Step 7 : Commit**

```bash
git add apps/api/src/votes/votes.service.ts \
        apps/api/src/votes/votes.module.ts \
        apps/api/src/votes/votes.service.test.ts \
        apps/api/src/app.integration.test.ts
git commit -m "feat(votes): require recorded privacy consent before castVote"
```

---

**Sortie de Phase 2** : un votant ne peut plus voter sans avoir d'abord posté un consentement explicite à la version courante de la politique de confidentialité (TTL 30 jours). La preuve légale est dans `PrivacyConsent`, survit aux purges du vault, et n'est jamais effacée par les annulations.
