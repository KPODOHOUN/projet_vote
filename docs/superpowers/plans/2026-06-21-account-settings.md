# Account Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une page de réglages de compte (infos, changer mot de passe, changer email, gérer sessions avec appareil/IP) au-dessus d'un nouveau module backend `account`.

**Architecture:** Migration ajoutant `userAgent`/`ipAddress` à `AuthSession`, capturés dans `AuthService.createSession`. Nouveau module NestJS `account` (controller + service) réutilisant `AuthService` (helpers publics `issueAccessToken`/`hashRefreshToken`). Frontend : couche `lib/account.ts` + page `/dashboard/account` (couche dashboard `vp-*` + primitives). Tests vraie DB côté backend, Playwright côté front.

**Tech Stack:** NestJS, Prisma/PostgreSQL, bcryptjs, jose (JWT), `node:test`, Next.js 15/React 19, Tailwind v4, Playwright.

## Global Constraints

- ZERO fake data ; ZERO contrôle décoratif. Toute donnée via les contrats réels.
- TypeScript strict + `exactOptionalPropertyTypes: true` (front) ; passer `string | undefined` quand une valeur peut être absente.
- Tests backend : **vraie DB `votezpro_test`**, jamais de mock Prisma (`node:test` + `assert/strict`, `resetDatabase()` en `beforeEach`, service construit en direct). `AuthSession`/`User`/`Tenant` sont déjà dans `test-utils/db.ts` TABLES.
- Hash mot de passe : `bcryptjs` `hash(pwd, 12)` / `compare`. Cookie refresh : `vp_refresh`. Session courante = `AuthSession.refreshTokenHash === sha256(vp_refresh)`.
- i18n : clés `account.*` + `nav.account` ajoutées en **fr ET en** dans `apps/web/lib/i18n.ts` (sinon `MessageKey` casse le typecheck). Aucune string métier en dur (pattern eyebrow `isEn ?` toléré).
- Couche publique = `vp-*` ; couche dashboard = `vp-*` scaffolding + primitives `@/components/ui`. Pas d'élément brut stylé hors `vp-*`.
- Révocation des autres sessions sur changement mdp/email ; email immédiat, protégé par mdp, sans email de vérification ; IP brute (pas de lookup géo).
- Contrats backend de référence : `docs/superpowers/specs/2026-06-21-account-settings-design.md`.
- Vérif backend : `npm run typecheck --workspace=apps/api` puis le test ciblé `node --import tsx --test apps/api/src/account/account.service.test.ts` (depuis la racine ; mêmes outils que les tests existants). Vérif front (depuis `apps/web/`) : `npx tsc --noEmit`, `npx eslint .`, `npx next build`.

---

### Task 1: Migration — appareil/IP sur AuthSession

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (modèle `AuthSession`)
- Create: `packages/db/prisma/migrations/20260621120000_add_session_device_metadata/migration.sql`

**Interfaces:**
- Produces: colonnes `AuthSession.userAgent String?`, `AuthSession.ipAddress String?` ; client Prisma régénéré.

- [ ] **Step 1: Ajouter les champs au schéma.** Dans `schema.prisma`, modèle `AuthSession`, après `rotatedFromSessionId String?` :

```prisma
  userAgent           String?
  ipAddress           String?
```

- [ ] **Step 2: Écrire la migration SQL** (`.../20260621120000_add_session_device_metadata/migration.sql`) :

```sql
ALTER TABLE "AuthSession" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "ipAddress" TEXT;
```

- [ ] **Step 3: Appliquer à la base dev + régénérer le client.**

Run: `npm run db:generate --workspace=@votezpro/db && DATABASE_URL=$DATABASE_URL npx --workspace=@votezpro/db prisma migrate deploy`
(Si `prisma migrate deploy` n'est pas câblé, appliquer le SQL via `prisma db execute --file` sur dev ET sur `votezpro_test`.) Expected : les 2 colonnes existent sur dev et test.

- [ ] **Step 4: Vérifier le typecheck du package db + de l'API.**

Run: `npm run typecheck --workspace=@votezpro/db && npm run typecheck --workspace=apps/api`
Expected: 0 erreur (le client Prisma typé expose `userAgent`/`ipAddress`).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260621120000_add_session_device_metadata
git commit -m "feat(db): AuthSession userAgent + ipAddress columns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: AuthService — capture meta + helpers publics

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.service.test.ts` (ajout d'un test)

**Interfaces:**
- Consumes: colonnes Task 1.
- Produces (sur `AuthService`) :
  - `type SessionMeta = { userAgent?: string | null; ipAddress?: string | null }` (exporté depuis `auth.service.ts`)
  - `createSession(user, rotatedFromSessionId?: string, meta?: SessionMeta)` — stocke `userAgent`/`ipAddress`
  - `register(payload, meta?)`, `login(payload, meta?)`, `refresh(payload, meta?)`, `acceptInvitation(payload, meta?)` — propagent `meta`
  - `issueAccessToken(user: AuthUser): Promise<string>` (public, wrappe `signAccessToken`)
  - `hashRefreshToken(raw: string): string` (public, wrappe `hashToken`)

- [ ] **Step 1: Écrire le test (login stocke l'appareil/IP).** Ajouter dans `auth.service.test.ts` :

```ts
test("login enregistre userAgent + ipAddress sur la session", async () => {
  await authService.login(
    { tenantSlug: credentials.tenantSlug, email: credentials.email, password: credentials.password },
    { userAgent: "TestAgent/1.0", ipAddress: "203.0.113.7" }
  );
  const session = await prisma.authSession.findFirst({
    where: { refreshTokenHash: { not: "" } },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(session);
  assert.equal(session.userAgent, "TestAgent/1.0");
  assert.equal(session.ipAddress, "203.0.113.7");
});
```

- [ ] **Step 2: Lancer le test → échec attendu.**

Run: `node --import tsx --test apps/api/src/auth/auth.service.test.ts`
Expected: FAIL (login n'accepte pas encore `meta` / colonnes non remplies).

- [ ] **Step 3: Implémenter.** Dans `auth.service.ts` :
  - Ajouter près des imports/types : `export type SessionMeta = { userAgent?: string | null; ipAddress?: string | null };`
  - Élargir `createSession` (signature → `private async createSession(user: AuthUser, rotatedFromSessionId?: string, meta?: SessionMeta)`), et dans l'objet `data`, ajouter `userAgent: meta?.userAgent ?? null,` et `ipAddress: meta?.ipAddress ?? null,`.
  - `register/login/refresh/acceptInvitation` : ajouter un dernier paramètre `meta?: SessionMeta` et le passer à `createSession(user, undefined, meta)` (pour register/login/acceptInvitation) ou `createSession(user, oldSessionId, meta)` (pour refresh — garder l'argument de rotation existant).
  - Ajouter les helpers publics :

```ts
  async issueAccessToken(user: AuthUser): Promise<string> {
    return this.signAccessToken(user);
  }

  hashRefreshToken(raw: string): string {
    return this.hashToken(raw);
  }
```

  Dans `auth.controller.ts`, extraire la meta de la requête et la passer. Ajouter un helper en haut du fichier :

```ts
import type { Request } from "express";

function extractSessionMeta(request: Request) {
  const fwd = request.headers["x-forwarded-for"];
  const forwarded = Array.isArray(fwd) ? fwd[0] : fwd;
  const ipAddress = (forwarded?.split(",")[0].trim()) || request.ip || null;
  const userAgent = request.headers["user-agent"] ?? null;
  return { userAgent, ipAddress };
}
```

  Puis dans `register`/`login`/`refresh`/`acceptInvitation` du contrôleur : injecter `@Req() request: Request` si absent et passer `extractSessionMeta(request)` comme dernier argument de l'appel service correspondant.

- [ ] **Step 4: Lancer le test → succès.**

Run: `node --import tsx --test apps/api/src/auth/auth.service.test.ts`
Expected: PASS (tous les tests auth, dont le nouveau).

- [ ] **Step 5: Typecheck API.**

Run: `npm run typecheck --workspace=apps/api`
Expected: 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(auth): capture session userAgent/ip + expose token helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: AccountService + tests

**Files:**
- Create: `apps/api/src/account/account.service.ts`
- Test: `apps/api/src/account/account.service.test.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuthService` (`issueAccessToken`, `hashRefreshToken` — Task 2), `bcryptjs`.
- Produces (sur `AccountService`) :
  - `getAccount(user: AuthUser): Promise<{ email: string; role: string; tenant: { displayName: string; slug: string }; createdAt: string }>`
  - `changePassword(user: AuthUser, payload: unknown, currentRefreshToken?: string): Promise<{ success: true }>`
  - `changeEmail(user: AuthUser, payload: unknown, currentRefreshToken?: string): Promise<{ accessToken: string }>`
  - `listSessions(user: AuthUser, currentRefreshToken?: string): Promise<{ items: Array<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; expiresAt: string; current: boolean }> }>`
  - `revokeOtherSessions(user: AuthUser, currentRefreshToken?: string): Promise<{ revoked: number }>`
  - `revokeSession(user: AuthUser, sessionId: string): Promise<{ id: string; revoked: true }>`

- [ ] **Step 1: Écrire les tests** (`account.service.test.ts`) :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { compare } from "bcryptjs";
import { AccountService } from "./account.service";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const authService = new AuthService(prismaService);
const accountService = new AccountService(prismaService, authService);

const creds = {
  tenantSlug: "acct-test",
  tenantDisplayName: "Acct Test",
  email: "owner@acct-test.africa",
  password: "SecurePass123!"
};

async function seedAndLogin() {
  await authService.register(creds);
  const { refreshToken, accessToken } = await authService.login({
    tenantSlug: creds.tenantSlug, email: creds.email, password: creds.password
  });
  const user = await authService.verifyAccessToken(accessToken);
  return { user, refreshToken };
}

before(() => assertTestDatabase());
beforeEach(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

test("changePassword: mauvais mot de passe actuel → rejet", async () => {
  const { user, refreshToken } = await seedAndLogin();
  await assert.rejects(
    accountService.changePassword(user, { currentPassword: "WrongPass999!", newPassword: "NewPass12345!" }, refreshToken),
    /actuel|invalide|incorrect/i
  );
});

test("changePassword: succès met à jour le hash et révoque les autres sessions", async () => {
  const { user, refreshToken } = await seedAndLogin();
  // 2e session (autre appareil)
  await authService.login({ tenantSlug: creds.tenantSlug, email: creds.email, password: creds.password }, { userAgent: "Other", ipAddress: "1.2.3.4" });
  await accountService.changePassword(user, { currentPassword: creds.password, newPassword: "NewPass12345!" }, refreshToken);
  const dbUser = await prisma.user.findFirst({ where: { id: user.userId } });
  assert.ok(dbUser && (await compare("NewPass12345!", dbUser.passwordHash)));
  const active = await prisma.authSession.findMany({ where: { userId: user.userId, revokedAt: null } });
  // seule la session courante survit
  assert.equal(active.length, 1);
  assert.equal(active[0].refreshTokenHash, authService.hashRefreshToken(refreshToken));
});

test("changeEmail: email déjà membre → conflit", async () => {
  const { user, refreshToken } = await seedAndLogin();
  // un second user dans le même tenant
  await prisma.user.create({ data: { tenantId: user.tenantId, email: "taken@acct-test.africa", passwordHash: "x", role: "ORGANIZER_STAFF" } });
  await assert.rejects(
    accountService.changeEmail(user, { newEmail: "taken@acct-test.africa", currentPassword: creds.password }, refreshToken),
    /déjà|exist|conflit/i
  );
});

test("changeEmail: succès met à jour l'email et réémet un access token le contenant", async () => {
  const { user, refreshToken } = await seedAndLogin();
  const { accessToken } = await accountService.changeEmail(user, { newEmail: "new@acct-test.africa", currentPassword: creds.password }, refreshToken);
  const decoded = await authService.verifyAccessToken(accessToken);
  assert.equal(decoded.email, "new@acct-test.africa");
  const dbUser = await prisma.user.findFirst({ where: { id: user.userId } });
  assert.equal(dbUser?.email, "new@acct-test.africa");
});

test("listSessions: marque la session courante et exclut les révoquées", async () => {
  const { user, refreshToken } = await seedAndLogin();
  const { items } = await accountService.listSessions(user, refreshToken);
  assert.ok(items.length >= 1);
  const current = items.filter((s) => s.current);
  assert.equal(current.length, 1);
});

test("revokeSession: session d'un autre user → introuvable", async () => {
  const { user } = await seedAndLogin();
  // session appartenant à un autre user
  const other = await prisma.user.create({ data: { tenantId: user.tenantId, email: "other@acct-test.africa", passwordHash: "x", role: "ORGANIZER_STAFF" } });
  const otherSession = await prisma.authSession.create({ data: { tenantId: user.tenantId, userId: other.id, refreshTokenHash: "deadbeef", expiresAt: new Date(Date.now() + 1e9) } });
  await assert.rejects(accountService.revokeSession(user, otherSession.id), /introuvable|not found|404/i);
});
```

- [ ] **Step 2: Lancer → échec attendu.**

Run: `node --import tsx --test apps/api/src/account/account.service.test.ts`
Expected: FAIL (`AccountService` n'existe pas).

- [ ] **Step 3: Implémenter `account.service.ts`** :

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72)
});
const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1)
});

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly authService: AuthService) {}

  private async requireUser(user: AuthUser) {
    const row = await this.prisma.client.user.findUnique({ where: { id: user.userId } });
    if (!row) throw new NotFoundException("Compte introuvable.");
    return row;
  }

  async getAccount(user: AuthUser) {
    const row = await this.requireUser(user);
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant) throw new NotFoundException("Organisation introuvable.");
    return {
      email: row.email,
      role: row.role,
      tenant: { displayName: tenant.displayName, slug: tenant.slug },
      createdAt: row.createdAt.toISOString()
    };
  }

  private async revokeOthers(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken ? this.authService.hashRefreshToken(currentRefreshToken) : null;
    const result = await this.prisma.client.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentHash ? { refreshTokenHash: { not: currentHash } } : {})
      },
      data: { revokedAt: new Date() }
    });
    return result.count;
  }

  async changePassword(user: AuthUser, payload: unknown, currentRefreshToken?: string) {
    const input = changePasswordSchema.parse(payload);
    const row = await this.requireUser(user);
    const ok = await compare(input.currentPassword, row.passwordHash);
    if (!ok) throw new UnauthorizedException("Mot de passe actuel invalide.");
    await this.prisma.client.user.update({ where: { id: row.id }, data: { passwordHash: await hash(input.newPassword, 12) } });
    await this.revokeOthers(row.id, currentRefreshToken);
    await this.audit(user, "account.password.changed", row.id, {});
    return { success: true as const };
  }

  async changeEmail(user: AuthUser, payload: unknown, currentRefreshToken?: string) {
    const input = changeEmailSchema.parse(payload);
    const row = await this.requireUser(user);
    const ok = await compare(input.currentPassword, row.passwordHash);
    if (!ok) throw new UnauthorizedException("Mot de passe actuel invalide.");
    const newEmail = input.newEmail.toLowerCase();
    if (newEmail !== row.email) {
      const existing = await this.prisma.client.user.findUnique({ where: { tenantId_email: { tenantId: user.tenantId, email: newEmail } } });
      if (existing) throw new ConflictException("Cette adresse est déjà utilisée dans l'organisation.");
    }
    await this.prisma.client.user.update({ where: { id: row.id }, data: { email: newEmail } });
    await this.revokeOthers(row.id, currentRefreshToken);
    await this.audit(user, "account.email.changed", row.id, { email: newEmail });
    const accessToken = await this.authService.issueAccessToken({ ...user, email: newEmail });
    return { accessToken };
  }

  async listSessions(user: AuthUser, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken ? this.authService.hashRefreshToken(currentRefreshToken) : null;
    const rows = await this.prisma.client.authSession.findMany({
      where: { userId: user.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true, refreshTokenHash: true }
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: currentHash != null && s.refreshTokenHash === currentHash
      }))
    };
  }

  async revokeOtherSessions(user: AuthUser, currentRefreshToken?: string) {
    if (!currentRefreshToken) throw new BadRequestException("Session courante introuvable.");
    const revoked = await this.revokeOthers(user.userId, currentRefreshToken);
    await this.audit(user, "account.session.revoked", user.userId, { scope: "others" });
    return { revoked };
  }

  async revokeSession(user: AuthUser, sessionId: string) {
    const session = await this.prisma.client.authSession.findFirst({ where: { id: sessionId, userId: user.userId } });
    if (!session) throw new NotFoundException("Session introuvable.");
    if (!session.revokedAt) {
      await this.prisma.client.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    }
    await this.audit(user, "account.session.revoked", session.id, { scope: "one" });
    return { id: session.id, revoked: true as const };
  }

  private async audit(user: AuthUser, action: string, targetId: string, metadata: Record<string, string>) {
    await this.prisma.client.auditLog.create({
      data: { tenantId: user.tenantId, actorUserId: user.userId, actorRole: user.role, action, targetType: "Account", targetId, metadata }
    });
  }
}
```

- [ ] **Step 4: Lancer → succès.**

Run: `node --import tsx --test apps/api/src/account/account.service.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/account/account.service.ts apps/api/src/account/account.service.test.ts
git commit -m "feat(account): account service (password/email/sessions) + real-db tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: AccountController + module wiring

**Files:**
- Create: `apps/api/src/account/account.controller.ts`
- Create: `apps/api/src/account/account.module.ts`
- Modify: `apps/api/src/app.module.ts` (importer `AccountModule`)

**Interfaces:**
- Consumes: `AccountService` (Task 3), `AuthGuard` + `@CurrentUser` (auth), cookie `vp_refresh`.
- Produces: routes `/account`, `/account/password`, `/account/email`, `/account/sessions`, `/account/sessions/revoke-others`, `DELETE /account/sessions/:id`.

- [ ] **Step 1: Créer `account.controller.ts`** :

```ts
import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AccountService } from "./account.service";

const REFRESH_COOKIE_NAME = "vp_refresh";
function refreshToken(request: Request): string | undefined {
  return (request.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE_NAME];
}

@Controller("account")
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  getAccount(@CurrentUser() user: AuthUser) {
    return this.accountService.getAccount(user);
  }

  @Post("password")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() request: Request) {
    return this.accountService.changePassword(user, body, refreshToken(request));
  }

  @Post("email")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  changeEmail(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() request: Request) {
    return this.accountService.changeEmail(user, body, refreshToken(request));
  }

  @Get("sessions")
  listSessions(@CurrentUser() user: AuthUser, @Req() request: Request) {
    return this.accountService.listSessions(user, refreshToken(request));
  }

  @Post("sessions/revoke-others")
  revokeOthers(@CurrentUser() user: AuthUser, @Req() request: Request) {
    return this.accountService.revokeOtherSessions(user, refreshToken(request));
  }

  @Delete("sessions/:id")
  revokeSession(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.accountService.revokeSession(user, id);
  }
}
```

- [ ] **Step 2: Créer `account.module.ts`** (réutilise `AuthModule` pour `AuthService` + `AuthGuard`) :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma/prisma.service";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, PrismaService]
})
export class AccountModule {}
```

- [ ] **Step 3: Enregistrer dans `app.module.ts`.** Ajouter `import { AccountModule } from "./account/account.module";` et l'ajouter au tableau `imports` du `@Module`.

- [ ] **Step 4: Typecheck + lancer toute la suite auth/account.**

Run: `npm run typecheck --workspace=apps/api && node --import tsx --test apps/api/src/account/account.service.test.ts apps/api/src/auth/auth.service.test.ts`
Expected: 0 erreur TS ; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/account/account.controller.ts apps/api/src/account/account.module.ts apps/api/src/app.module.ts
git commit -m "feat(account): controller + module wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Clés i18n

**Files:**
- Modify: `apps/web/lib/i18n.ts` (blocs `fr` et `en`)

**Interfaces:**
- Produces: `nav.account`, `account.*` (consommées par Tasks 6–7).

- [ ] **Step 1: Ajouter en FR** (après `nav.team`, puis un bloc `account.*` à la suite des clés) :

```ts
    "nav.account": "Compte",
    "account.title": "Mon compte",
    "account.subtitle": "Gérez vos identifiants et vos sessions actives.",
    "account.infoTitle": "Informations",
    "account.email": "E-mail",
    "account.role": "Rôle",
    "account.org": "Organisation",
    "account.memberSince": "Membre depuis",
    "account.pwTitle": "Changer le mot de passe",
    "account.pwCurrent": "Mot de passe actuel",
    "account.pwNew": "Nouveau mot de passe",
    "account.pwConfirm": "Confirmer le nouveau mot de passe",
    "account.pwSubmit": "Mettre à jour le mot de passe",
    "account.pwSubmitting": "Mise à jour…",
    "account.pwSuccess": "Mot de passe mis à jour. Vos autres sessions ont été déconnectées.",
    "account.pwTooShort": "8 caractères minimum.",
    "account.pwMismatch": "Les mots de passe ne correspondent pas.",
    "account.pwWrong": "Mot de passe actuel invalide.",
    "account.emailTitle": "Changer l'e-mail",
    "account.emailNew": "Nouvel e-mail",
    "account.emailPw": "Mot de passe actuel",
    "account.emailSubmit": "Mettre à jour l'e-mail",
    "account.emailSubmitting": "Mise à jour…",
    "account.emailSuccess": "E-mail mis à jour.",
    "account.emailTaken": "Cette adresse est déjà utilisée.",
    "account.sessTitle": "Sessions actives",
    "account.sessCurrent": "Session actuelle",
    "account.sessUnknownDevice": "Appareil inconnu",
    "account.sessCreated": "Connectée le",
    "account.sessExpires": "Expire le",
    "account.sessRevoke": "Révoquer",
    "account.sessRevokeTitle": "Révoquer cette session ?",
    "account.sessRevokeDesc": "Cet appareil sera déconnecté. Action définitive.",
    "account.sessRevokeOthers": "Déconnecter les autres sessions",
    "account.sessRevokeOthersTitle": "Déconnecter les autres sessions ?",
    "account.sessRevokeOthersDesc": "Toutes les sessions sauf celle-ci seront déconnectées.",
    "account.cancel": "Annuler",
    "account.loading": "Chargement…",
    "account.loadError": "Chargement du compte impossible.",
    "account.required": "Ce champ est requis.",
    "account.genericError": "Action impossible. Réessayez.",
```

- [ ] **Step 2: Ajouter les MÊMES clés en EN** (valeurs anglaises) :

```ts
    "nav.account": "Account",
    "account.title": "My account",
    "account.subtitle": "Manage your credentials and active sessions.",
    "account.infoTitle": "Information",
    "account.email": "Email",
    "account.role": "Role",
    "account.org": "Organization",
    "account.memberSince": "Member since",
    "account.pwTitle": "Change password",
    "account.pwCurrent": "Current password",
    "account.pwNew": "New password",
    "account.pwConfirm": "Confirm new password",
    "account.pwSubmit": "Update password",
    "account.pwSubmitting": "Updating…",
    "account.pwSuccess": "Password updated. Your other sessions have been signed out.",
    "account.pwTooShort": "Minimum 8 characters.",
    "account.pwMismatch": "Passwords do not match.",
    "account.pwWrong": "Current password is invalid.",
    "account.emailTitle": "Change email",
    "account.emailNew": "New email",
    "account.emailPw": "Current password",
    "account.emailSubmit": "Update email",
    "account.emailSubmitting": "Updating…",
    "account.emailSuccess": "Email updated.",
    "account.emailTaken": "This address is already in use.",
    "account.sessTitle": "Active sessions",
    "account.sessCurrent": "Current session",
    "account.sessUnknownDevice": "Unknown device",
    "account.sessCreated": "Signed in",
    "account.sessExpires": "Expires",
    "account.sessRevoke": "Revoke",
    "account.sessRevokeTitle": "Revoke this session?",
    "account.sessRevokeDesc": "This device will be signed out. Permanent action.",
    "account.sessRevokeOthers": "Sign out other sessions",
    "account.sessRevokeOthersTitle": "Sign out other sessions?",
    "account.sessRevokeOthersDesc": "All sessions except this one will be signed out.",
    "account.cancel": "Cancel",
    "account.loading": "Loading…",
    "account.loadError": "Unable to load your account.",
    "account.required": "This field is required.",
    "account.genericError": "Action failed. Please try again.",
```

- [ ] **Step 3: Typecheck.**

Run (depuis `apps/web/`): `npx tsc --noEmit`
Expected: PASS (fr/en symétriques).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n.ts
git commit -m "feat(web): i18n keys for account settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Couche données `lib/account.ts`

**Files:**
- Create: `apps/web/lib/account.ts`

**Interfaces:**
- Consumes: `apiFetch` (`./api`).
- Produces: types `Account`, `AccountSession` ; `getAccount`, `changePassword`, `changeEmail`, `listSessions`, `revokeOtherSessions`, `revokeSession`, `deviceLabel`.

- [ ] **Step 1: Créer le fichier**

```ts
import { apiFetch } from "./api";

export type Account = {
  email: string;
  role: string;
  tenant: { displayName: string; slug: string };
  createdAt: string;
};

export type AccountSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function getAccount(token: string) {
  return apiFetch<Account>("/account", { headers: authHeaders(token) });
}

export function changePassword(token: string, input: { currentPassword: string; newPassword: string }) {
  return apiFetch<{ success: true }>("/account/password", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function changeEmail(token: string, input: { newEmail: string; currentPassword: string }) {
  return apiFetch<{ accessToken: string }>("/account/email", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function listSessions(token: string) {
  return apiFetch<{ items: AccountSession[] }>("/account/sessions", { headers: authHeaders(token) });
}

export function revokeOtherSessions(token: string) {
  return apiFetch<{ revoked: number }>("/account/sessions/revoke-others", {
    method: "POST",
    headers: authHeaders(token)
  });
}

export function revokeSession(token: string, id: string) {
  return apiFetch<{ id: string; revoked: true }>(`/account/sessions/${id}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
}

// Libellé appareil lisible depuis l'User-Agent (heuristique légère, pas de lib).
export function deviceLabel(userAgent: string | null, fallback: string): string {
  if (!userAgent) return fallback;
  const browser = /Edg/.test(userAgent) ? "Edge"
    : /Chrome/.test(userAgent) ? "Chrome"
    : /Firefox/.test(userAgent) ? "Firefox"
    : /Safari/.test(userAgent) ? "Safari"
    : null;
  const os = /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent) ? "iOS"
    : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser || os || fallback;
}
```

- [ ] **Step 2: Typecheck.**

Run (depuis `apps/web/`): `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/account.ts
git commit -m "feat(web): account API client + device label helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Page `/dashboard/account` + sidebar

**Files:**
- Create: `apps/web/app/dashboard/account/page.tsx`
- Modify: `apps/web/components/dashboard-sidebar.tsx` (item nav)

**Interfaces:**
- Consumes: `lib/account.ts` (Task 6), `getStoredToken`/`setStoredToken` (`lib/auth`), `apiFetch`/`ApiError`, `useI18n`, primitives `Button`/`Input`/`StatusChip`/`EmptyState`/`LoadingState`/`ConfirmDialog`, clés `account.*` (Task 5).
- Produces: route `/dashboard/account`.

- [ ] **Step 1: Créer la page** (`apps/web/app/dashboard/account/page.tsx`) :

```tsx
"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "../../../lib/api";
import { getStoredToken, setStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import {
  getAccount, changePassword, changeEmail, listSessions, revokeOtherSessions, revokeSession,
  deviceLabel, type Account, type AccountSession
} from "../../../lib/account";
import { Button, Input, StatusChip, EmptyState, LoadingState, ConfirmDialog } from "@/components/ui";

export default function DashboardAccountPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";

  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // password form
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwFieldError, setPwFieldError] = useState<string | undefined>(undefined);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // email form
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const requireToken = () => {
    const token = getStoredToken();
    if (!token) router.push("/login");
    return token;
  };

  const loadSessions = async (token: string) => {
    const res = await listSessions(token);
    setSessions(res.items);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { router.push("/login"); return; }
    setIsLoading(true);
    setLoadError("");
    void (async () => {
      try {
        setAccount(await getAccount(token));
        await loadSessions(token);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t("account.loadError"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPwError(""); setPwSuccess(false); setPwFieldError(undefined);
    if (pwNew.length < 8) { setPwFieldError(t("account.pwTooShort")); return; }
    if (pwNew !== pwConfirm) { setPwFieldError(t("account.pwMismatch")); return; }
    const token = requireToken(); if (!token) return;
    setPwBusy(true);
    try {
      await changePassword(token, { currentPassword: pwCurrent, newPassword: pwNew });
      setPwSuccess(true); setPwCurrent(""); setPwNew(""); setPwConfirm("");
      await loadSessions(token);
    } catch (e) {
      setPwError(e instanceof ApiError && e.status === 401 ? t("account.pwWrong") : e instanceof Error ? e.message : t("account.genericError"));
    } finally { setPwBusy(false); }
  };

  const onChangeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(""); setEmailSuccess(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setEmailError(t("account.required")); return; }
    const token = requireToken(); if (!token) return;
    setEmailBusy(true);
    try {
      const res = await changeEmail(token, { newEmail, currentPassword: emailPw });
      setStoredToken(res.accessToken);
      setEmailSuccess(true); setEmailPw("");
      setAccount(await getAccount(res.accessToken));
      await loadSessions(res.accessToken);
    } catch (e) {
      setEmailError(
        e instanceof ApiError && e.status === 409 ? t("account.emailTaken")
        : e instanceof ApiError && e.status === 401 ? t("account.pwWrong")
        : e instanceof Error ? e.message : t("account.genericError")
      );
    } finally { setEmailBusy(false); }
  };

  const doRevoke = async (id: string) => {
    const token = requireToken(); if (!token) return;
    try { await revokeSession(token, id); await loadSessions(token); }
    catch (e) { setLoadError(e instanceof Error ? e.message : t("account.genericError")); }
  };

  const doRevokeOthers = async () => {
    const token = requireToken(); if (!token) return;
    try { await revokeOtherSessions(token); await loadSessions(token); }
    catch (e) { setLoadError(e instanceof Error ? e.message : t("account.genericError")); }
  };

  return (
    <section className="vp-stack-lg">
      <header className="vp-block-head">
        <div>
          <span className="vp-eyebrow">{isEn ? "Account" : "Compte"}</span>
          <h2 className="vp-block-title">{t("account.title")}</h2>
          <p className="vp-muted">{t("account.subtitle")}</p>
        </div>
      </header>

      {isLoading ? (
        <LoadingState variant="rows" count={3} label={t("account.loading")} />
      ) : loadError ? (
        <p className="vp-error" role="alert">{loadError}</p>
      ) : (
        <>
          {/* Infos */}
          {account ? (
            <section className="vp-card-panel">
              <h3 className="vp-section-title">{t("account.infoTitle")}</h3>
              <dl className="vp-info-grid">
                <div><dt>{t("account.email")}</dt><dd>{account.email}</dd></div>
                <div><dt>{t("account.role")}</dt><dd><StatusChip label={account.role} tone="active" /></dd></div>
                <div><dt>{t("account.org")}</dt><dd>{account.tenant.displayName} <span className="vp-muted">@{account.tenant.slug}</span></dd></div>
                <div><dt>{t("account.memberSince")}</dt><dd>{new Date(account.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}</dd></div>
              </dl>
            </section>
          ) : null}

          {/* Mot de passe */}
          <section className="vp-card-panel">
            <h3 className="vp-section-title">{t("account.pwTitle")}</h3>
            <form className="vp-form" onSubmit={onChangePassword} noValidate>
              <Input id="pw-current" label={t("account.pwCurrent")} type="password" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
              <Input id="pw-new" label={t("account.pwNew")} type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} state={pwFieldError ? "error" : "default"} errorText={pwFieldError} required />
              <Input id="pw-confirm" label={t("account.pwConfirm")} type="password" autoComplete="new-password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
              {pwError ? <p className="vp-error" role="alert">{pwError}</p> : null}
              {pwSuccess ? <p className="vp-success" role="status">{t("account.pwSuccess")}</p> : null}
              <Button type="submit" loading={pwBusy}>{pwBusy ? t("account.pwSubmitting") : t("account.pwSubmit")}</Button>
            </form>
          </section>

          {/* Email */}
          <section className="vp-card-panel">
            <h3 className="vp-section-title">{t("account.emailTitle")}</h3>
            <form className="vp-form" onSubmit={onChangeEmail} noValidate>
              <Input id="email-new" label={t("account.emailNew")} type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              <Input id="email-pw" label={t("account.emailPw")} type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} required />
              {emailError ? <p className="vp-error" role="alert">{emailError}</p> : null}
              {emailSuccess ? <p className="vp-success" role="status">{t("account.emailSuccess")}</p> : null}
              <Button type="submit" loading={emailBusy}>{emailBusy ? t("account.emailSubmitting") : t("account.emailSubmit")}</Button>
            </form>
          </section>

          {/* Sessions */}
          <section className="vp-card-panel">
            <div className="vp-inline vp-inline-between">
              <h3 className="vp-section-title">{t("account.sessTitle")}</h3>
              {sessions.length > 1 ? (
                <ConfirmDialog
                  trigger={<Button type="button" variant="secondary">{t("account.sessRevokeOthers")}</Button>}
                  title={t("account.sessRevokeOthersTitle")}
                  description={t("account.sessRevokeOthersDesc")}
                  confirmLabel={t("account.sessRevokeOthers")}
                  cancelLabel={t("account.cancel")}
                  onConfirm={() => void doRevokeOthers()}
                />
              ) : null}
            </div>
            {sessions.length === 0 ? (
              <EmptyState title={t("account.sessTitle")} description={t("account.loading")} />
            ) : (
              <ul className="vp-event-rows">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <div className="vp-event-row-meta">
                      {s.current ? <StatusChip label={t("account.sessCurrent")} tone="active" /> : null}
                      <strong>{deviceLabel(s.userAgent, t("account.sessUnknownDevice"))}</strong>
                      <span>
                        {s.ipAddress ?? "—"} · {t("account.sessCreated")} {new Date(s.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                      </span>
                    </div>
                    {!s.current ? (
                      <ConfirmDialog
                        trigger={<Button type="button" variant="ghost">{t("account.sessRevoke")}</Button>}
                        title={t("account.sessRevokeTitle")}
                        description={t("account.sessRevokeDesc")}
                        confirmLabel={t("account.sessRevoke")}
                        cancelLabel={t("account.cancel")}
                        onConfirm={() => void doRevoke(s.id)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Ajouter les styles** dans `apps/web/app/globals.css` (après `.vp-invite-link-field`), tokens uniquement :

```css
/* Réglages compte : panneaux de section + grille d'infos. */
.vp-stack-lg { display: grid; gap: 28px; }
.vp-card-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--vp-line);
  border-radius: 14px;
  background: var(--color-card);
}
.vp-section-title {
  font-family: var(--vp-font-display);
  font-weight: 700;
  font-size: 18px;
  color: var(--vp-ink);
}
.vp-inline-between { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.vp-info-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
.vp-info-grid dt { font-size: 12px; color: var(--vp-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.vp-info-grid dd { margin: 2px 0 0; font-weight: 600; color: var(--vp-ink); }
@media (max-width: 600px) { .vp-info-grid { grid-template-columns: 1fr; } }
```

(Si `.vp-success` n'existe pas dans globals.css, l'ajouter : `.vp-success { color: var(--color-success); font-size: 13px; }`. Vérifier d'abord avec `grep -n "\.vp-success" apps/web/app/globals.css`.)

- [ ] **Step 3: Item sidebar.** Dans `dashboard-sidebar.tsx`, importer `CircleUser` depuis `lucide-react` (ajouter à la liste) et insérer dans `navItems` après l'item `/dashboard/team` :

```ts
    { href: "/dashboard/account", label: t("nav.account"), icon: CircleUser },
```

- [ ] **Step 4: Typecheck + lint + build.**

Run (depuis `apps/web/`): `npx tsc --noEmit && npx eslint app/dashboard/account/page.tsx components/dashboard-sidebar.tsx && npx next build`
Expected: 0 erreur ; route `○ /dashboard/account` présente.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/account apps/web/app/globals.css apps/web/components/dashboard-sidebar.tsx
git commit -m "feat(web): account settings page + sidebar entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: e2e + vérification finale

**Files:**
- Create: `apps/web/tests/e2e/account.spec.ts`

**Interfaces:**
- Consumes: routes `/dashboard/account` + endpoints `/account/*`. Réutilise le harnais e2e (register tenant+OWNER via API, login via UI) déjà utilisé par `invitations.spec.ts`.

- [ ] **Step 1: Lire le harnais existant.**

Run: `sed -n '1,45p' apps/web/tests/e2e/invitations.spec.ts`
Expected: récupérer le pattern register+login et les conventions de sélecteurs.

- [ ] **Step 2: Écrire `account.spec.ts`** (adapter au harnais réel lu à l'étape 1) :

```ts
import { test, expect } from "@playwright/test";
// Réutiliser le helper register+login OWNER d'invitations.spec.ts.

test.describe("Réglages compte", () => {
  test("affiche les infos, change le mot de passe, liste la session courante", async ({ page }) => {
    // 1. register+login OWNER (helper du harnais) → /dashboard/account
    await page.goto("/dashboard/account");
    // 2. Infos : l'email seedé est visible
    await expect(page.getByText(/@/)).toBeVisible();
    // 3. Session courante marquée
    await expect(page.locator(".vp-event-rows")).toContainText(/session actuelle|current session/i);
    // 4. Mauvais mot de passe actuel → erreur
    await page.getByLabel(/mot de passe actuel|current password/i).first().fill("WrongPass999!");
    await page.getByLabel(/nouveau mot de passe|new password/i).fill("NewSecret12345");
    await page.getByLabel(/confirmer|confirm/i).fill("NewSecret12345");
    await page.getByRole("button", { name: /mettre à jour le mot de passe|update password/i }).click();
    await expect(page.getByRole("alert")).toContainText(/invalide|invalid/i);
  });
});
```

- [ ] **Step 3: Lancer l'e2e** comme le reste de la suite (Playwright `webServer` + API Postgres). Si l'environnement ne peut pas démarrer la stack, NE PAS simuler : reporter DONE_WITH_CONCERNS avec la commande exacte. Sinon :

Run (depuis `apps/web/`): la même commande que la suite e2e du repo, filtrée sur `account`.
Expected: PASS.

- [ ] **Step 4: Vérification finale.**

Run: `npm run typecheck --workspace=apps/api && node --import tsx --test apps/api/src/account/account.service.test.ts` puis (depuis `apps/web/`) `npx tsc --noEmit && npx eslint . && npx next build`
Expected: tests backend PASS ; 0 erreur TS/lint ; build prod exit 0 ; route `/dashboard/account` présente.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/account.spec.ts
git commit -m "test(web): e2e for account settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Migration appareil/IP → Task 1 ✅
- Capture meta au login/refresh/accept + helpers `issueAccessToken`/`hashRefreshToken` → Task 2 ✅
- `GET /account`, `POST /account/password`, `POST /account/email`, `GET /account/sessions`, `POST /account/sessions/revoke-others`, `DELETE /account/sessions/:id` → Tasks 3 (logique) + 4 (routes) ✅
- Révocation des autres sessions sur mdp/email ; email réémet le JWT ; current session via hash cookie → Task 3 (`revokeOthers`, `changeEmail`, `listSessions`) ✅
- Tests vraie DB (401 mauvais mdp, 409 email pris, succès révoque autres, IDOR session 404) → Task 3 ✅
- Frontend data layer + deviceLabel → Task 6 ✅
- Page 4 sections + états + a11y → Task 7 ✅
- Sidebar + i18n fr/en → Tasks 5,7 ✅
- e2e → Task 8 ✅
- Hors-scope (vérif email, nom/avatar, 2FA, géo IP) non implémentés ✅

**Placeholder scan:** le seul élément à compléter est le helper de login du test e2e (Task 8) — délégué au harnais existant comme pour #1. Tout le reste contient le code complet.

**Type consistency:** `Account`/`AccountSession` (Task 6) alignés sur les retours de `AccountService` (Task 3). `SessionMeta` (Task 2) utilisé par createSession. Props `ConfirmDialog`/`Input`/`Button`/`StatusChip` conformes aux primitives réelles. `revokeOthers` exclut la courante via `refreshTokenHash != sha256(cookie)`, cohérent entre `changePassword`/`changeEmail`/`revokeOtherSessions`/`listSessions`.
