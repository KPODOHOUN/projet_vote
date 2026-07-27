# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notifications in-app (table + module + 4 déclencheurs métier) avec cloche header (polling) et page liste.

**Architecture:** Modèle `Notification` (une ligne par destinataire) + `NotificationsCoreModule` (service, sans AuthModule → évite un cycle) + `NotificationsModule` (controller + AuthGuard). `create()` est best-effort fire-and-forget, appelée depuis 4 services existants (payments/events/auth/payouts). Frontend : `lib/notifications.ts` + cloche dans le header (polling ~30s) + page `/dashboard/notifications`.

**Tech Stack:** NestJS, Prisma/PostgreSQL, zod, `node:test`, Next.js 15/React 19, Tailwind v4, Playwright.

## Global Constraints

- ZERO fake data ; toute donnée via les contrats réels. ZERO contrôle décoratif.
- TS strict + `exactOptionalPropertyTypes` (front).
- Tests backend : **vraie DB `votezpro_test`**, jamais de mock Prisma (`node:test` + `assert/strict`, `resetDatabase()` en `beforeEach`, service construit en direct). **Ajouter `"Notification"` à la liste `TABLES` de `apps/api/src/test-utils/db.ts`** (sinon resetDatabase ne la purge pas).
- Destinataires = membres du tenant de rôle **≠ `ORGANIZER_STAFF`**.
- `create(tenantId, type, data)` est **best-effort, ne lève JAMAIS** (try/catch interne) ; appelée en *fire-and-forget* (`void`) aux sites de déclencheurs, hors transaction métier — un échec n'interrompt jamais paiement/activation/invitation/payout.
- Notifications scopées `userId` ; `markRead` vérifie l'appartenance (404 sinon, pas d'IDOR).
- Stockage `type` + `data` structurée (pas de texte) ; libellé localisé fr/en rendu côté client.
- i18n : clés `notif.*` + `nav.notifications` en **fr ET en** (sinon `MessageKey` casse le typecheck). Aucune string métier en dur (pattern `isEn ?` toléré).
- Couche dashboard = `vp-*` scaffolding + primitives ; CSS en tokens uniquement.
- **Anti-cycle** : `NotificationsCoreModule` (providers `[NotificationsService, PrismaService]`, exports `[NotificationsService]`) n'importe PAS `AuthModule`. Les modules déclencheurs importent `NotificationsCoreModule`. `NotificationsModule` (controller) importe `[AuthModule, NotificationsCoreModule]`.
- Contrats de référence : `docs/superpowers/specs/2026-06-22-notifications-design.md`.
- Vérif backend : `npm run typecheck --workspace=apps/api` + `node --import tsx --test apps/api/src/notifications/notifications.service.test.ts`. Vérif front (depuis `apps/web/`) : `npx tsc --noEmit`, `npx eslint .`, `npx next build`.

---

### Task 1: Migration + modèle Notification

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260622120000_notifications/migration.sql`
- Modify: `apps/api/src/test-utils/db.ts` (ajouter `"Notification"` à TABLES)

**Interfaces:**
- Produces: enum `NotificationType`, modèle `Notification` (client Prisma régénéré).

- [ ] **Step 1: Schéma.** Ajouter dans `schema.prisma` :

```prisma
enum NotificationType {
  PAYMENT_SUCCEEDED
  INVITATION_ACCEPTED
  EVENT_ACTIVATED
  PAYOUT_SUCCEEDED
  PAYOUT_FAILED
}

model Notification {
  id        String           @id @default(cuid())
  tenantId  String
  userId    String
  type      NotificationType
  data      Json
  readAt    DateTime?
  createdAt DateTime         @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt])
}
```
Et ajouter les back-relations : dans `model Tenant { ... }` ajouter `notifications Notification[]`, dans `model User { ... }` ajouter `notifications Notification[]`.

- [ ] **Step 2: Migration SQL** (`.../20260622120000_notifications/migration.sql`) :

```sql
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_SUCCEEDED', 'INVITATION_ACCEPTED', 'EVENT_ACTIVATED', 'PAYOUT_SUCCEEDED', 'PAYOUT_FAILED');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "data" JSONB NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: TABLES de test.** Dans `apps/api/src/test-utils/db.ts`, ajouter `"Notification"` au tableau `TABLES` (avant `"User"` pour respecter l'ordre des FK ; `TRUNCATE ... CASCADE` rend l'ordre indifférent, mais rester cohérent).

- [ ] **Step 4: Appliquer + générer.** Appliquer la migration aux DB dev ET `votezpro_test` (via `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma` avec le bon `DATABASE_URL` exporté, ou `prisma db execute --file`), puis `npm run db:generate --workspace=@votezpro/db`.

Run: `npm run typecheck --workspace=@votezpro/db && npm run typecheck --workspace=apps/api`
Expected: 0 erreur (le client expose `notification` + `NotificationType`).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260622120000_notifications apps/api/src/test-utils/db.ts
git commit -m "feat(db): Notification model + type enum

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: NotificationsService + core module + tests

**Files:**
- Create: `apps/api/src/notifications/notifications.service.ts`
- Create: `apps/api/src/notifications/notifications-core.module.ts`
- Test: `apps/api/src/notifications/notifications.service.test.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuthUser`, `NotificationType` (Prisma).
- Produces:
  - `NotificationsService.create(tenantId: string, type: NotificationType, data: Prisma.JsonObject): Promise<void>` (best-effort, ne lève jamais)
  - `list(user: AuthUser, opts: { limit?: number; unreadOnly?: boolean }): Promise<{ items: Array<{ id, type, data, readAt, createdAt }> }>`
  - `unreadCount(user: AuthUser): Promise<{ count: number }>`
  - `markRead(user: AuthUser, id: string): Promise<{ id: string; readAt: string }>`
  - `markAllRead(user: AuthUser): Promise<{ updated: number }>`
  - `NotificationsCoreModule` (exporte `NotificationsService`)

- [ ] **Step 1: Écrire les tests** (`notifications.service.test.ts`) :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import type { AuthUser } from "../auth/auth.types";

const service = new NotificationsService(new PrismaService());

async function seedTenant(slug: string) {
  const tenant = await prisma.tenant.create({ data: { slug, displayName: `T-${slug}` } });
  const owner = await prisma.user.create({ data: { tenantId: tenant.id, email: `owner@${slug}.africa`, passwordHash: "x", role: "ORGANIZER_OWNER" } });
  const staff = await prisma.user.create({ data: { tenantId: tenant.id, email: `staff@${slug}.africa`, passwordHash: "x", role: "ORGANIZER_STAFF" } });
  return { tenant, owner, staff };
}
function asUser(u: { id: string; tenantId: string }, role: string): AuthUser {
  return { userId: u.id, tenantId: u.tenantId, role, email: "x" };
}

before(() => assertTestDatabase());
beforeEach(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

test("create fan-out vers les non-STAFF uniquement", async () => {
  const a = await seedTenant("ntf");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "x@y.z" });
  const ownerRows = await prisma.notification.findMany({ where: { userId: a.owner.id } });
  const staffRows = await prisma.notification.findMany({ where: { userId: a.staff.id } });
  assert.equal(ownerRows.length, 1);
  assert.equal(staffRows.length, 0);
});

test("create best-effort : tenant sans destinataire non-STAFF → no-op, ne lève pas", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "empty", displayName: "Empty" } });
  await prisma.user.create({ data: { tenantId: tenant.id, email: "s@empty.africa", passwordHash: "x", role: "ORGANIZER_STAFF" } });
  await service.create(tenant.id, "EVENT_ACTIVATED", { eventId: "e", title: "T" });
  const rows = await prisma.notification.findMany({ where: { tenantId: tenant.id } });
  assert.equal(rows.length, 0);
});

test("list + unreadCount scopés à l'utilisateur", async () => {
  const a = await seedTenant("scope");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "x@y.z" });
  const owner = asUser(a.owner, "ORGANIZER_OWNER");
  const { items } = await service.list(owner, { limit: 20 });
  assert.equal(items.length, 1);
  const { count } = await service.unreadCount(owner);
  assert.equal(count, 1);
  // le STAFF n'a rien
  const { count: staffCount } = await service.unreadCount(asUser(a.staff, "ORGANIZER_STAFF"));
  assert.equal(staffCount, 0);
});

test("markRead marque la sienne ; celle d'autrui → NotFound", async () => {
  const a = await seedTenant("read");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "x@y.z" });
  const ownerRow = await prisma.notification.findFirstOrThrow({ where: { userId: a.owner.id } });
  await service.markRead(asUser(a.owner, "ORGANIZER_OWNER"), ownerRow.id);
  const after = await prisma.notification.findUniqueOrThrow({ where: { id: ownerRow.id } });
  assert.ok(after.readAt);
  // un autre user ne peut pas marquer cette notif
  await assert.rejects(service.markRead(asUser(a.staff, "ORGANIZER_STAFF"), ownerRow.id), /introuvable|not found|404/i);
});

test("markAllRead passe toutes les non-lues du user à lues", async () => {
  const a = await seedTenant("allread");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "1@y.z" });
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "2@y.z" });
  const { updated } = await service.markAllRead(asUser(a.owner, "ORGANIZER_OWNER"));
  assert.equal(updated, 2);
  const { count } = await service.unreadCount(asUser(a.owner, "ORGANIZER_OWNER"));
  assert.equal(count, 0);
});
```

- [ ] **Step 2: Lancer → échec.**

Run: `node --import tsx --test apps/api/src/notifications/notifications.service.test.ts`
Expected: FAIL (`NotificationsService` n'existe pas).

- [ ] **Step 3: Implémenter `notifications.service.ts`** :

```ts
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { NotificationType, Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Best-effort : ne lève jamais. Fan-out vers les membres non-STAFF du tenant.
  async create(tenantId: string, type: NotificationType, data: Prisma.JsonObject): Promise<void> {
    try {
      const recipients = await this.prisma.client.user.findMany({
        where: { tenantId, role: { not: "ORGANIZER_STAFF" } },
        select: { id: true }
      });
      if (recipients.length === 0) return;
      await this.prisma.client.notification.createMany({
        data: recipients.map((r) => ({ tenantId, userId: r.id, type, data }))
      });
    } catch (error) {
      this.logger.error(`notification create failed (${type}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async list(user: AuthUser, opts: { limit?: number; unreadOnly?: boolean }) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const rows = await this.prisma.client.notification.findMany({
      where: { userId: user.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, type: true, data: true, readAt: true, createdAt: true }
    });
    return {
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString()
      }))
    };
  }

  async unreadCount(user: AuthUser) {
    const count = await this.prisma.client.notification.count({ where: { userId: user.userId, readAt: null } });
    return { count };
  }

  async markRead(user: AuthUser, id: string) {
    const row = await this.prisma.client.notification.findFirst({ where: { id, userId: user.userId } });
    if (!row) throw new NotFoundException("Notification introuvable.");
    const readAt = row.readAt ?? new Date();
    if (!row.readAt) {
      await this.prisma.client.notification.update({ where: { id: row.id }, data: { readAt } });
    }
    return { id: row.id, readAt: readAt.toISOString() };
  }

  async markAllRead(user: AuthUser) {
    const result = await this.prisma.client.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() }
    });
    return { updated: result.count };
  }
}
```

- [ ] **Step 4: Créer `notifications-core.module.ts`** :

```ts
import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

@Module({
  providers: [NotificationsService, PrismaService],
  exports: [NotificationsService]
})
export class NotificationsCoreModule {}
```

- [ ] **Step 5: Lancer → succès.**

Run: `node --import tsx --test apps/api/src/notifications/notifications.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + Commit**

Run: `npm run typecheck --workspace=apps/api` → 0 erreur.
```bash
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications-core.module.ts apps/api/src/notifications/notifications.service.test.ts
git commit -m "feat(notifications): service (fan-out/list/read) + core module + real-db tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: NotificationsController + web module + suite wiring

**Files:**
- Create: `apps/api/src/notifications/notifications.controller.ts`
- Create: `apps/api/src/notifications/notifications.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json` (test + test:coverage)

**Interfaces:**
- Consumes: `NotificationsService` (Task 2), `AuthGuard`, `@CurrentUser`.
- Produces: routes `/notifications*`.

- [ ] **Step 1: Créer `notifications.controller.ts`** :

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("limit") limit?: string, @Query("unreadOnly") unreadOnly?: string) {
    return this.notifications.list(user, {
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === "true"
    });
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Post(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser, @Body() _body: unknown) {
    return this.notifications.markAllRead(user);
  }
}
```

- [ ] **Step 2: Créer `notifications.module.ts`** :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsCoreModule } from "./notifications-core.module";

@Module({
  imports: [AuthModule, NotificationsCoreModule],
  controllers: [NotificationsController]
})
export class NotificationsModule {}
```

- [ ] **Step 3: app.module.ts.** Ajouter `import { NotificationsModule } from "./notifications/notifications.module";` et `NotificationsModule` au tableau `imports`.

- [ ] **Step 4: Câbler le test.** Dans `apps/api/package.json`, ajouter `dist/notifications/notifications.service.test.js` aux listes `test` ET `test:coverage` (près de `dist/search/search.service.test.js`).

- [ ] **Step 5: Typecheck + test.**

Run: `npm run typecheck --workspace=apps/api && node --import tsx --test apps/api/src/notifications/notifications.service.test.ts`
Expected: 0 erreur ; 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/notifications/notifications.controller.ts apps/api/src/notifications/notifications.module.ts apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(notifications): controller + module wiring + suite entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Câblage des 4 déclencheurs + tests d'intégration

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts` + `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/events/events.service.ts` + `apps/api/src/events/events.module.ts`
- Modify: `apps/api/src/payments/feexpay/feexpay-verify.service.ts` + son module (`apps/api/src/payments/payments.module.ts` ou le module qui déclare `FeexpayVerifyService`)
- Modify: `apps/api/src/payouts/payouts.service.ts` + `apps/api/src/payouts/payouts.module.ts`
- Test: `apps/api/src/notifications/notifications-triggers.test.ts`

**Interfaces:**
- Consumes: `NotificationsService.create` (Task 2), `NotificationsCoreModule`.

**Pattern commun pour chaque service** : ajouter `NotificationsCoreModule` aux `imports` du module ; injecter `private readonly notifications: NotificationsService` dans le constructeur ; appeler `void this.notifications.create(...)` (fire-and-forget) au bon endroit, APRÈS le commit de la transaction métier.

- [ ] **Step 1: Écrire les tests d'intégration** (`notifications-triggers.test.ts`) — couvre les 2 déclencheurs testables au niveau service (invitation via AuthService, activation via EventsService) :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { AuthService } from "../auth/auth.service";
import { EventsService } from "../events/events.service";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const notifications = new NotificationsService(prismaService);
const authService = new AuthService(prismaService, notifications);
const eventsService = new EventsService(prismaService, notifications);

const creds = { tenantSlug: "trig", tenantDisplayName: "Trig", email: "owner@trig.africa", password: "SecurePass123!" };

before(() => assertTestDatabase());
beforeEach(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

test("acceptInvitation déclenche une notification INVITATION_ACCEPTED pour l'owner", async () => {
  await authService.register(creds);
  const owner = await prisma.user.findFirstOrThrow({ where: { email: creds.email } });
  // créer une invitation directement
  const { createHash, randomBytes } = await import("crypto");
  const rawToken = randomBytes(32).toString("hex");
  await prisma.invitation.create({
    data: { tenantId: owner.tenantId, email: "newbie@trig.africa", role: "ORGANIZER_STAFF", tokenHash: createHash("sha256").update(rawToken).digest("hex"), status: "PENDING", expiresAt: new Date(Date.now() + 1e9), invitedByUserId: owner.id }
  });
  await authService.acceptInvitation({ token: rawToken, password: "AcceptPass123!" });
  // laisser le fire-and-forget se résoudre
  await new Promise((r) => setTimeout(r, 50));
  const notifs = await prisma.notification.findMany({ where: { userId: owner.id, type: "INVITATION_ACCEPTED" } });
  assert.equal(notifs.length, 1);
});
```
(Note : si `AuthService`/`EventsService` ont d'autres dépendances de constructeur, adapter l'instanciation du test en conséquence — lire les constructeurs réels avant d'écrire. Le test de l'activation event peut être ajouté de la même façon en appelant `eventsService.update(owner, eventId, { status: "ACTIVE" })` après avoir seedé un event payé ; si la mise en place est trop lourde, garder au moins le test d'invitation et noter l'event/payment/payout comme couverts par le typecheck + non-régression + l'e2e.)

- [ ] **Step 2: Lancer → échec attendu** (AuthService n'accepte pas encore `notifications`).

Run: `node --import tsx --test apps/api/src/notifications/notifications-triggers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Câbler `auth.service.ts`.** Injecter `private readonly notifications: NotificationsService` (2e param du constructeur). Dans `acceptInvitation`, APRÈS la création de l'utilisateur et la transition de l'invitation à ACCEPTED (avant le `return` des tokens), ajouter :

```ts
void this.notifications.create(invitation.tenantId, "INVITATION_ACCEPTED", { email: invitation.email });
```
Dans `auth.module.ts` : ajouter `NotificationsCoreModule` aux `imports`.

- [ ] **Step 4: Câbler `events.service.ts`.** Injecter `NotificationsService`. La condition d'activation existe déjà (`input.status === EventStatus.ACTIVE && event.status !== EventStatus.ACTIVE`). Capturer ce booléen, et APRÈS `const updatedEvent = await ...update(...)`, ajouter :

```ts
if (input.status === "ACTIVE" && event.status !== "ACTIVE") {
  void this.notifications.create(user.tenantId, "EVENT_ACTIVATED", { eventId: updatedEvent.id, title: updatedEvent.title });
}
```
Dans `events.module.ts` : ajouter `NotificationsCoreModule` aux `imports`.

- [ ] **Step 5: Câbler `feexpay-verify.service.ts`.** Injecter `NotificationsService`. APRÈS le bloc `await this.prisma.client.$transaction(...)` (donc après commit), pour un paiement de vote réussi, ajouter :

```ts
if (tx.purpose === "VOTE") {
  void this.notifications.create(tx.tenantId, "PAYMENT_SUCCEEDED", { eventId: tx.eventId, amountCfa: tx.amountCfa });
}
```
Ajouter `NotificationsCoreModule` aux `imports` du module qui fournit `FeexpayVerifyService`.

- [ ] **Step 6: Câbler `payouts.service.ts`.** Injecter `NotificationsService`. Aux transitions `payout.update` → `SUCCEEDED` et → `FAILED`, ajouter après chaque update (en utilisant l'objet payout en scope pour `tenantId`/`amountCfa`) :

```ts
void this.notifications.create(payout.tenantId, "PAYOUT_SUCCEEDED", { payoutId: payout.id, amountCfa: payout.amountCfa });
// et pour l'échec :
void this.notifications.create(payout.tenantId, "PAYOUT_FAILED", { payoutId: payout.id, amountCfa: payout.amountCfa });
```
(Adapter le nom de la variable payout en scope à chaque site.) Ajouter `NotificationsCoreModule` aux `imports` de `payouts.module.ts`.

- [ ] **Step 7: Lancer le test d'intégration + la suite des services touchés (non-régression).**

Run: `node --import tsx --test apps/api/src/notifications/notifications-triggers.test.ts apps/api/src/auth/auth.service.test.ts apps/api/src/events/events.service.test.ts`
Expected: PASS (le nouveau test + auth + events inchangés). Puis `npm run typecheck --workspace=apps/api` → 0 erreur.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(notifications): wire 4 business triggers (payment/event/invitation/payout)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Clés i18n

**Files:**
- Modify: `apps/web/lib/i18n.ts` (fr + en)

**Interfaces:**
- Produces: `notif.*`, `nav.notifications` (consommées par Tasks 6–8).

- [ ] **Step 1: Ajouter en FR** :

```ts
    "nav.notifications": "Notifications",
    "notif.title": "Notifications",
    "notif.bellLabel": "Notifications",
    "notif.markAllRead": "Tout marquer comme lu",
    "notif.seeAll": "Voir tout",
    "notif.empty": "Aucune notification",
    "notif.loading": "Chargement…",
    "notif.error": "Chargement des notifications impossible.",
    "notif.paymentSucceeded": "Vote payé reçu",
    "notif.invitationAccepted": "Invitation acceptée",
    "notif.eventActivated": "Événement activé",
    "notif.payoutSucceeded": "Versement réussi",
    "notif.payoutFailed": "Versement échoué",
```

- [ ] **Step 2: Ajouter en EN** (mêmes clés) :

```ts
    "nav.notifications": "Notifications",
    "notif.title": "Notifications",
    "notif.bellLabel": "Notifications",
    "notif.markAllRead": "Mark all as read",
    "notif.seeAll": "See all",
    "notif.empty": "No notifications",
    "notif.loading": "Loading…",
    "notif.error": "Unable to load notifications.",
    "notif.paymentSucceeded": "Paid vote received",
    "notif.invitationAccepted": "Invitation accepted",
    "notif.eventActivated": "Event activated",
    "notif.payoutSucceeded": "Payout succeeded",
    "notif.payoutFailed": "Payout failed",
```

- [ ] **Step 3: Typecheck.** Run (depuis `apps/web/`): `npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n.ts
git commit -m "feat(web): i18n keys for notifications

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Couche données `lib/notifications.ts`

**Files:**
- Create: `apps/web/lib/notifications.ts`

**Interfaces:**
- Consumes: `apiFetch`.
- Produces: types + `listNotifications`/`unreadCount`/`markRead`/`markAllRead` + `notificationText`/`notificationHref`.

- [ ] **Step 1: Créer le fichier**

```ts
import { apiFetch } from "./api";

export type NotificationType = "PAYMENT_SUCCEEDED" | "INVITATION_ACCEPTED" | "EVENT_ACTIVATED" | "PAYOUT_SUCCEEDED" | "PAYOUT_FAILED";
export type AppNotification = { id: string; type: NotificationType; data: Record<string, unknown>; readAt: string | null; createdAt: string };

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function listNotifications(token: string, opts?: { limit?: number; unreadOnly?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.unreadOnly) params.set("unreadOnly", "true");
  const qs = params.toString();
  return apiFetch<{ items: AppNotification[] }>(`/notifications${qs ? `?${qs}` : ""}`, { headers: authHeaders(token) });
}

export function unreadCount(token: string) {
  return apiFetch<{ count: number }>("/notifications/unread-count", { headers: authHeaders(token) });
}

export function markRead(token: string, id: string) {
  return apiFetch<{ id: string; readAt: string }>(`/notifications/${id}/read`, { method: "POST", headers: authHeaders(token) });
}

export function markAllRead(token: string) {
  return apiFetch<{ updated: number }>("/notifications/read-all", { method: "POST", headers: authHeaders(token) });
}

type Translate = (key: string) => string;

export function notificationText(n: AppNotification, t: Translate, isEn: boolean): string {
  const amount = (v: unknown) => Number(v ?? 0).toLocaleString(isEn ? "en-GB" : "fr-FR");
  switch (n.type) {
    case "PAYMENT_SUCCEEDED":
      return `${t("notif.paymentSucceeded")} · ${amount(n.data.amountCfa)} XOF`;
    case "INVITATION_ACCEPTED":
      return `${t("notif.invitationAccepted")} · ${String(n.data.email ?? "")}`;
    case "EVENT_ACTIVATED":
      return `${t("notif.eventActivated")} · ${String(n.data.title ?? "")}`;
    case "PAYOUT_SUCCEEDED":
      return `${t("notif.payoutSucceeded")} · ${amount(n.data.amountCfa)} XOF`;
    case "PAYOUT_FAILED":
      return `${t("notif.payoutFailed")} · ${amount(n.data.amountCfa)} XOF`;
  }
}

export function notificationHref(n: AppNotification): string {
  switch (n.type) {
    case "PAYMENT_SUCCEEDED":
    case "PAYOUT_SUCCEEDED":
    case "PAYOUT_FAILED":
      return "/dashboard/payments";
    case "INVITATION_ACCEPTED":
      return "/dashboard/team";
    case "EVENT_ACTIVATED":
      return `/dashboard/events/${String(n.data.eventId ?? "")}/candidates`;
  }
}
```

- [ ] **Step 2: Typecheck.** Run (depuis `apps/web/`): `npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/notifications.ts
git commit -m "feat(web): notifications API client + text/href helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Cloche dans le header

**Files:**
- Modify: `apps/web/components/dashboard-header.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `lib/notifications.ts` (Task 6), `getStoredToken`, `useI18n`, clés `notif.*`.

- [ ] **Step 1: Ajouter la cloche** dans `dashboard-header.tsx`. Conserver la palette de recherche (gauche) et le bloc compte/logout (droite) ; insérer la cloche AVANT le libellé compte dans le `<div className="flex items-center gap-4">` de droite. Ajouter en haut du fichier l'import `Bell` à la liste lucide-react existante, et `useEffect`/`useRef`/`useState` sont déjà importés. Ajouter ce sous-composant dans le même fichier (ou inline) :

```tsx
// (dans DashboardHeader, ajouter les états et le bloc cloche)
// états :
const [notifCount, setNotifCount] = useState(0);
const [notifOpen, setNotifOpen] = useState(false);
const [notifItems, setNotifItems] = useState<AppNotification[] | null>(null);
const [notifLoading, setNotifLoading] = useState(false);
const [notifError, setNotifError] = useState(false);
const bellRef = useRef<HTMLDivElement>(null);

// polling du compteur (~30s) :
useEffect(() => {
  const token = getStoredToken();
  if (!token) return;
  let active = true;
  const poll = () => { void unreadCount(token).then((r) => { if (active) setNotifCount(r.count); }).catch(() => {}); };
  poll();
  const id = setInterval(poll, 30_000);
  return () => { active = false; clearInterval(id); };
}, []);

// fermeture clic extérieur :
useEffect(() => {
  const onClick = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setNotifOpen(false); };
  document.addEventListener("mousedown", onClick);
  return () => document.removeEventListener("mousedown", onClick);
}, []);

const openNotifs = () => {
  const next = !notifOpen;
  setNotifOpen(next);
  if (next) {
    const token = getStoredToken();
    if (!token) return;
    setNotifLoading(true); setNotifError(false);
    void listNotifications(token, { limit: 10 })
      .then((r) => { setNotifItems(r.items); setNotifLoading(false); })
      .catch(() => { setNotifError(true); setNotifLoading(false); });
  }
};

const onNotifClick = (n: AppNotification) => {
  const token = getStoredToken();
  if (token) void markRead(token, n.id).then(() => setNotifCount((c) => Math.max(0, c - 1))).catch(() => {});
  setNotifOpen(false);
  router.push(notificationHref(n));
};

const onMarkAll = () => {
  const token = getStoredToken();
  if (token) void markAllRead(token).then(() => { setNotifCount(0); setNotifItems((items) => items?.map((it) => ({ ...it, readAt: it.readAt ?? new Date().toISOString() })) ?? null); }).catch(() => {});
};
```

Et le markup de la cloche (dans le `<div>` de droite, avant le `<span>` compte) :

```tsx
<div ref={bellRef} className="vp-bell">
  <button type="button" className="vp-bell-btn" onClick={openNotifs} aria-label={`${t("notif.bellLabel")} (${notifCount})`}>
    <Bell className="h-5 w-5" aria-hidden="true" />
    {notifCount > 0 ? <span className="vp-bell-badge">{notifCount > 9 ? "9+" : notifCount}</span> : null}
  </button>
  {notifOpen ? (
    <div className="vp-bell-panel" aria-label={t("notif.title")}>
      <div className="vp-bell-head">
        <strong>{t("notif.title")}</strong>
        <button type="button" className="vp-bell-allread" onClick={onMarkAll}>{t("notif.markAllRead")}</button>
      </div>
      {notifLoading ? (
        <p className="vp-search-status">{t("notif.loading")}</p>
      ) : notifError ? (
        <p className="vp-search-status vp-error">{t("notif.error")}</p>
      ) : !notifItems || notifItems.length === 0 ? (
        <p className="vp-search-status">{t("notif.empty")}</p>
      ) : (
        notifItems.map((n) => (
          <button key={n.id} type="button" className={`vp-bell-item${n.readAt ? "" : " is-unread"}`} onClick={() => onNotifClick(n)}>
            <span>{notificationText(n, t, isEn)}</span>
            <time>{new Date(n.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}</time>
          </button>
        ))
      )}
      <Link href="/dashboard/notifications" className="vp-search-all" onClick={() => setNotifOpen(false)}>{t("notif.seeAll")} →</Link>
    </div>
  ) : null}
</div>
```
Imports à ajouter en tête : `import { listNotifications, unreadCount, markRead, markAllRead, notificationText, notificationHref, type AppNotification } from "../lib/notifications";` ; ajouter `locale` au `useI18n()` (`const { t, locale } = useI18n(); const isEn = locale === "en";`) si pas déjà présent. **Corriger** la coquille `class‑Name` → `className` ci-dessus.

- [ ] **Step 2: Styles** dans `globals.css` (tokens uniquement) :

```css
/* Cloche de notifications. */
.vp-bell { position: relative; }
.vp-bell-btn { position: relative; display: flex; align-items: center; justify-content: center; height: 44px; width: 44px; border-radius: 10px; border: 0; background: none; color: var(--vp-muted); cursor: pointer; }
.vp-bell-btn:hover { background: var(--color-muted); color: var(--vp-ink); }
.vp-bell-badge { position: absolute; top: 6px; right: 6px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: var(--color-destructive); color: var(--color-destructive-foreground); font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }
.vp-bell-panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; width: 340px; max-height: 70vh; overflow-y: auto; padding: 8px; border: 1px solid var(--vp-line); border-radius: 12px; background: var(--color-card); box-shadow: var(--vp-shadow-lifted); }
.vp-bell-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; }
.vp-bell-allread { background: none; border: 0; color: var(--color-primary); font-size: 12px; font-weight: 600; cursor: pointer; }
.vp-bell-item { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 8px 10px; text-align: left; border: 0; border-radius: 8px; background: none; cursor: pointer; }
.vp-bell-item:hover { background: var(--color-muted); }
.vp-bell-item.is-unread { background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.vp-bell-item span { font-size: 13px; color: var(--vp-ink); }
.vp-bell-item time { font-size: 11px; color: var(--vp-muted); }
```

- [ ] **Step 3: Typecheck + lint + build.**

Run (depuis `apps/web/`): `npx tsc --noEmit && npx eslint components/dashboard-header.tsx && npx next build`
Expected: 0 erreur ; build exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/dashboard-header.tsx apps/web/app/globals.css
git commit -m "feat(web): notifications bell in dashboard header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Page `/dashboard/notifications` + sidebar

**Files:**
- Create: `apps/web/app/dashboard/notifications/page.tsx`
- Modify: `apps/web/components/dashboard-sidebar.tsx`

**Interfaces:**
- Consumes: `lib/notifications.ts`, `getStoredToken`, `useI18n`, primitives `LoadingState`/`EmptyState`/`Button`, clés `notif.*`/`nav.notifications`.

- [ ] **Step 1: Créer la page** :

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { listNotifications, markRead, markAllRead, notificationText, notificationHref, type AppNotification } from "../../../lib/notifications";
import { Button, LoadingState, EmptyState } from "@/components/ui";

export default function NotificationsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = async (token: string) => {
    const res = await listNotifications(token, { limit: 50 });
    setItems(res.items);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { router.push("/login"); return; }
    setIsLoading(true); setError("");
    void reload(token)
      .catch((e) => setError(e instanceof Error ? e.message : t("notif.error")))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onItem = (n: AppNotification) => {
    const token = getStoredToken();
    if (token) void markRead(token, n.id).catch(() => {});
    router.push(notificationHref(n));
  };

  const onMarkAll = async () => {
    const token = getStoredToken();
    if (!token) return;
    try { await markAllRead(token); await reload(token); } catch { /* ignore */ }
  };

  return (
    <section>
      <header className="vp-block-head">
        <div>
          <span className="vp-eyebrow">{isEn ? "Activity" : "Activité"}</span>
          <h2 className="vp-block-title">{t("notif.title")}</h2>
        </div>
        {items.some((n) => !n.readAt) ? (
          <Button type="button" variant="secondary" onClick={() => void onMarkAll()}>{t("notif.markAllRead")}</Button>
        ) : null}
      </header>

      {isLoading ? (
        <LoadingState variant="rows" count={5} label={t("notif.loading")} />
      ) : error ? (
        <p className="vp-error" role="alert">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState title={t("notif.empty")} description={t("notif.title")} />
      ) : (
        <ul className="vp-event-rows">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" className="vp-event-row-meta" style={{ width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer" }} onClick={() => onItem(n)}>
                <strong>{notificationText(n, t, isEn)}</strong>
                <span>{new Date(n.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}{n.readAt ? "" : " · ●"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Item sidebar.** Dans `dashboard-sidebar.tsx`, importer `Bell` depuis lucide-react (ajouter à la liste) et insérer dans `navItems` après l'item `/dashboard/account` :

```ts
    { href: "/dashboard/notifications", label: t("nav.notifications"), icon: Bell },
```

- [ ] **Step 3: Typecheck + lint + build.**

Run (depuis `apps/web/`): `npx tsc --noEmit && npx eslint app/dashboard/notifications components/dashboard-sidebar.tsx && npx next build`
Expected: 0 erreur ; route `/dashboard/notifications` présente.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/notifications apps/web/components/dashboard-sidebar.tsx
git commit -m "feat(web): notifications page + sidebar entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: e2e + vérification finale

**Files:**
- Create: `apps/web/tests/e2e/notifications.spec.ts`

**Interfaces:**
- Consumes: la cloche header + la page. Réutilise le flux d'`invitations.spec.ts` (register OWNER, créer une invitation, accepter via le lien) qui déclenche `INVITATION_ACCEPTED`.

- [ ] **Step 1: Lire le harnais** invitations + le flux d'acceptation.

Run: `sed -n '1,70p' apps/web/tests/e2e/invitations.spec.ts`
Expected: récupérer register+login OWNER, création d'invitation, capture du lien, acceptation.

- [ ] **Step 2: Écrire `notifications.spec.ts`** (adapter au harnais) :

```ts
import { test, expect } from "@playwright/test";
// Réutiliser le flux register+login OWNER + créer une invitation + l'accepter (déclenche INVITATION_ACCEPTED pour l'OWNER).

test.describe("Notifications", () => {
  test("l'acceptation d'une invitation crée une notification visible dans la cloche de l'OWNER", async ({ page, context }) => {
    // 1. register+login OWNER → /dashboard/team → créer une invitation, capturer le lien d'acceptation
    // 2. accepter l'invitation (dans une nouvelle page/contexte ou en se déconnectant) via /accept-invitation/<token>
    // 3. revenir en OWNER (re-login si nécessaire) → recharger le dashboard
    // 4. la cloche montre un badge ; ouvrir le panneau
    await page.getByRole("button", { name: /notifications/i }).first().click();
    // 5. l'item invitation acceptée est présent
    await expect(page.getByText(/invitation accept|invitation accept/i)).toBeVisible();
  });
});
```
(Compléter avec le flux réel du harnais ; si l'acceptation dans le même test est trop complexe, créer la notification via le vrai déclencheur reste l'objectif — ne PAS insérer de fausse notif. Si l'environnement ne permet pas le bout-en-bout, reporter DONE_WITH_CONCERNS avec la commande.)

- [ ] **Step 3: Lancer l'e2e** comme la suite du repo (Playwright webServer + API Postgres). Filtrer sur `notifications`. Ne pas simuler un succès.

- [ ] **Step 4: Vérification finale.**

Run: `npm run typecheck --workspace=apps/api && node --import tsx --test apps/api/src/notifications/notifications.service.test.ts apps/api/src/notifications/notifications-triggers.test.ts` puis (depuis `apps/web/`) `npx tsc --noEmit && npx eslint . && npx next build`
Expected: tests backend PASS ; 0 erreur TS/lint ; build prod exit 0 ; route `/dashboard/notifications` présente.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/notifications.spec.ts
git commit -m "test(web): e2e for notifications (invitation trigger → bell)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Modèle Notification + enum + migration + TABLES → Task 1 ✅
- Service (create fan-out best-effort, list, unreadCount, markRead IDOR-safe, markAllRead) + core module + tests → Task 2 ✅
- Controller + web module (anti-cycle) + app.module + suite wiring → Task 3 ✅
- Câblage 4 déclencheurs + tests d'intégration → Task 4 ✅
- i18n fr/en → Task 5 ✅
- lib/notifications.ts + text/href → Task 6 ✅
- Cloche header (polling 30s, dropdown, mark-read/all) → Task 7 ✅
- Page /dashboard/notifications + sidebar → Task 8 ✅
- e2e (vrai déclencheur invitation) → Task 9 ✅
- Hors-scope (email/push, SSE, préférences, votant public, agrégation) non implémentés ✅

**Placeholder scan:** les sites de déclencheurs (Task 4) demandent de lire les constructeurs réels avant d'instancier dans le test et d'adapter le nom de variable payout — délégué explicitement car ces signatures ne sont pas réécrites ici. Le flux d'acceptation e2e (Task 9) est délégué au harnais existant. Tout le reste contient le code complet.

**Type consistency:** `AppNotification`/`NotificationType` (Task 6) alignés sur la forme renvoyée par `NotificationsService.list` (Task 2). `notificationText(n, t, isEn)`/`notificationHref(n)` cohérents entre cloche (Task 7) et page (Task 8). Clés `notif.*` (Task 5) consommées par 6–8. `create(tenantId, type, data)` best-effort cohérent entre service (Task 2) et les 4 sites (Task 4). Anti-cycle : `NotificationsCoreModule` exporté en Task 2, importé par les déclencheurs en Task 4 et par `NotificationsModule` en Task 3.
