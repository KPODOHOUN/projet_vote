# Vérification email (lien) + Auth en modals — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prouver l'email à la première inscription via un lien de confirmation, et unifier login/register/"vérifiez votre mail" dans un seul composant modal.

**Architecture:** Register crée un compte `emailVerifiedAt = null` sans session et envoie un lien signé ; `POST /auth/verify` valide le token (hashé, single-use, 24h) puis émet la session ; `login` bloque un compte non vérifié (403). Front : un `<AuthModal>` (Dialog shadcn) à 3 vues, les routes `/login` `/register` deviennent des wrappers, `/auth/verify` confirme le lien.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Next.js App Router (apps/web), Vitest (tests API real-DB), Playwright (E2E), Resend (MailService).

## Adaptations en cours d'exécution (2026-07-07)
- **Modèle adopté = `AuthEmailToken` (au lieu de `EmailVerificationToken`)** : une session précédente avait déjà appliqué à la DB locale un design plus général (enum `AuthEmailTokenPurpose { EMAIL_VERIFICATION, PASSWORD_RESET }` + table `AuthEmailToken { id, userId, purpose, tokenHash, expiresAt, usedAt, createdAt }` + `User.emailVerifiedAt`), mais le code était perdu. On l'adopte. La migration `20260706180000_auth_email_tokens` a été reconstruite (fichier + `migrate resolve --applied` en local, `migrate deploy` sur `votezpro_test`), sans reset. **Dans tout le code des Tasks 2-4, remplacer `prisma.emailVerificationToken` par `prisma.authEmailToken` et ajouter `purpose: "EMAIL_VERIFICATION"`** (import `AuthEmailTokenPurpose` depuis `@prisma/client`) dans les `create`/`findUnique`/`deleteMany`. Le filtre de renvoi/lookup inclut `purpose: AuthEmailTokenPurpose.EMAIL_VERIFICATION`.
- Dérive préexistante hors périmètre : la DB locale manque 2 FK partner (`Event_partnerOfferTierId_fkey`, `PartnerRequest_offerTierId_fkey`) — non liée à ce chantier, non corrigée ici.

- **Runner de tests = `node:test` + `node:assert/strict`** (build vers `dist/` puis `node --test`), **pas vitest**. Les tests s'écrivent avec `test(...)`/`before`/`beforeEach`/`after` + `assert`. Lancement local d'un fichier : `cd apps/api && npm run build && DATABASE_URL=...votezpro_test npm run test:db:prepare && node --test dist/auth/auth.service.test.js`. Le script `npm test` recompile tout et exige `DATABASE_URL` sur une base `*_test`.
- **Ripple du changement de contrat `register` (plus de session) + login bloquant** — à traiter dans Tasks 2-4 :
  - Ajouter `new MailService()` à **5 instanciations** : `auth.service.test.ts`, `account.service.test.ts`, `backend-completion.test.ts`, `notifications/notifications-triggers.test.ts`, `privacy.service.test.ts`.
  - Tout test qui fait `register` puis `login`/utilise un token doit **marquer le compte vérifié** juste après register : `await prisma.user.updateMany({ where: { email }, data: { emailVerifiedAt: new Date() } })`. Concerne les `beforeEach`/setups de : `auth.service.test.ts`, `account.service.test.ts`, `notifications-triggers.test.ts`.
  - `app.integration.test.ts` (lignes ~90-106, 270-279) : le register HTTP ne renvoie plus `accessToken` → adapter le bootstrap d'auth pour récupérer le token de vérif en base et `POST /api/v1/auth/verify` avant d'utiliser un Bearer. Le test « re-register slug existant → 409 » reste valable.

## Global Constraints
- **Zéro placeholder, zéro fake data, TypeScript strict.**
- **Tests API sur vraie DB** (`votezpro_test`), jamais de mock Prisma. Toute nouvelle table s'ajoute à `apps/api/src/test-utils/db.ts` (`TABLES`).
- Token jamais stocké/loggué en clair en prod (SHA-256 ; brut seulement dans l'URL, loggué en `warn` uniquement si `MAIL_RESEND_API_KEY` absent).
- Réutiliser les patrons existants : hash token = `createHash("sha256").update(raw).digest("hex")` ; token brut = `randomBytes(32).toString("hex")`.
- Messages utilisateur en français ; le front gère les 2 locales via `useI18n()` (fallback FR).
- Le token d'accès reste en `localStorage` (durcissement hors périmètre).
- Emails via `MailService.send({ to: string[], subject, html, text? })` (best-effort, ne lève jamais).

---

## File Structure

**Backend (apps/api)**
- `packages/db/prisma/schema.prisma` — +`User.emailVerifiedAt`, +model `EmailVerificationToken`.
- `packages/db/prisma/migrations/<ts>_email_verification/migration.sql` — colonnes/table + backfill.
- `apps/api/src/auth/auth.service.ts` — register modifié + `verifyEmail`, `resendVerification`, login modifié, helper `sendVerificationEmail`.
- `apps/api/src/auth/auth.controller.ts` — register modifié, +`verify`, +`resend-verification`.
- `apps/api/src/auth/auth.module.ts` — importe `MailModule`.
- `apps/api/src/auth/email-verification.mail.ts` — template email (create).
- `apps/api/src/test-utils/db.ts` — +`EmailVerificationToken` dans `TABLES`.
- `apps/api/src/auth/auth.service.test.ts` — tests verify/resend/login/register.

**Frontend (apps/web)**
- `apps/web/components/auth/auth-modal.tsx` — `<AuthModal>` 3 vues (create).
- `apps/web/components/auth/use-auth-modal.tsx` — contexte ouvrir/fermer (create).
- `apps/web/app/login/page.tsx` — réduit en wrapper.
- `apps/web/app/register/page.tsx` — réduit en wrapper.
- `apps/web/app/auth/verify/page.tsx` — page de confirmation (create).
- `apps/web/components/ui/index.ts` — exporter `Dialog*`.

**Infra/doc**
- `render.yaml` — +`MAIL_RESEND_API_KEY` (sync:false), +`MAIL_FROM`.
- `docs/GUIDE_TESTEURS.md` — étape « confirmez votre email ».

---

## Task 1 : Schéma Prisma + migration + backfill + TABLES de test

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<ts>_email_verification/migration.sql`
- Modify: `apps/api/src/test-utils/db.ts:13-38`

**Interfaces:**
- Produces: `User.emailVerifiedAt: DateTime | null`, model `EmailVerificationToken { id, tokenHash, userId, expiresAt, usedAt, createdAt }`.

- [ ] **Step 1 : Ajouter le champ et le modèle au schéma**

Dans `schema.prisma`, ajouter à `model User` :
```prisma
  emailVerifiedAt        DateTime?
  emailVerificationTokens EmailVerificationToken[]
```
Et le nouveau modèle :
```prisma
model EmailVerificationToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

- [ ] **Step 2 : Générer la migration**

Run: `cd packages/db && npx prisma migrate dev --name email_verification --create-only`
Expected: crée `migrations/<ts>_email_verification/migration.sql` sans l'appliquer.

- [ ] **Step 3 : Ajouter le backfill à la fin du fichier migration.sql**

```sql
-- Les comptes existants sont réputés vérifiés (aucun blocage rétroactif).
UPDATE "User" SET "emailVerifiedAt" = now() WHERE "emailVerifiedAt" IS NULL;
```

- [ ] **Step 4 : Appliquer la migration (dev + test)**

Run: `cd packages/db && npx prisma migrate dev` puis `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`
Expected: `The following migration(s) have been applied` ; pas d'erreur.

- [ ] **Step 5 : Enregistrer la table dans les tests**

Dans `apps/api/src/test-utils/db.ts`, ajouter `"EmailVerificationToken",` dans le tableau `TABLES` **avant** `"User"` (contrainte FK → tronquer l'enfant d'abord), à côté de `"LoginAttempt"`.

- [ ] **Step 6 : Commit**

```bash
git add packages/db/prisma apps/api/src/test-utils/db.ts
git commit -m "feat(db): email verification token model + backfill existing users verified"
```

---

## Task 2 : Backend — helper d'envoi + register modifié

**Files:**
- Create: `apps/api/src/auth/email-verification.mail.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.test.ts`

**Interfaces:**
- Consumes: `EmailVerificationToken` (Task 1), `MailService.send`, `env.APP_PUBLIC_URL`, `env.MAIL_RESEND_API_KEY`.
- Produces: `AuthService.register(payload, meta) → { status: "verification_sent"; email: string }` (ne renvoie plus de session) ; `private sendVerificationEmail(user: { id: string; email: string })`.

- [ ] **Step 1 : Écrire le test qui échoue (register ne crée plus de session, crée un token)**

Dans `auth.service.test.ts`, ajouter :
```ts
it("register crée un compte non vérifié + un token de vérification, sans session", async () => {
  const res = await service.register({
    tenantSlug: "verif-org",
    tenantDisplayName: "Verif Org",
    email: "new@verif.africa",
    password: "password123",
    acceptPrivacyPolicy: true
  });
  expect(res).toEqual({ status: "verification_sent", email: "new@verif.africa" });
  const user = await prisma.client.user.findFirst({ where: { email: "new@verif.africa" } });
  expect(user?.emailVerifiedAt).toBeNull();
  const token = await prisma.client.emailVerificationToken.findFirst({ where: { userId: user!.id } });
  expect(token).toBeTruthy();
  const sessions = await prisma.client.authSession.count({ where: { userId: user!.id } });
  expect(sessions).toBe(0);
});
```

- [ ] **Step 2 : Lancer le test (échoue)**

Run: `cd apps/api && npx vitest run src/auth/auth.service.test.ts -t "register crée un compte non vérifié"`
Expected: FAIL (register renvoie encore `{accessToken, refreshToken}`).

- [ ] **Step 3 : Créer le template email**

`apps/api/src/auth/email-verification.mail.ts` :
```ts
export function buildVerificationEmail(verifyUrl: string): { subject: string; html: string; text: string } {
  const subject = "Confirmez votre adresse — SHADOMA Votes";
  const text = `Confirmez votre inscription en ouvrant ce lien (valable 24h) : ${verifyUrl}`;
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h1 style="font-size:20px">Confirmez votre adresse</h1>
  <p>Bienvenue sur SHADOMA Votes. Cliquez pour activer votre compte organisateur (lien valable 24 h) :</p>
  <p><a href="${verifyUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Confirmer mon email</a></p>
  <p style="color:#666;font-size:12px">Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.</p>
</div>`;
  return { subject, html, text };
}
```

- [ ] **Step 4 : Câbler MailModule dans AuthModule**

Dans `auth.module.ts` : importer `import { MailModule } from "../mail/mail.module";` et ajouter `MailModule` à `imports`.

- [ ] **Step 5 : Modifier `register` + ajouter `sendVerificationEmail`**

Dans `auth.service.ts` : ajouter les imports `import { MailService } from "../mail/mail.service";`, `import { buildVerificationEmail } from "./email-verification.mail";`, et injecter `private readonly mail: MailService` dans le constructeur.

Ajouter la constante en tête de classe : `private static readonly VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;`

Remplacer la fin de `register` (à partir de la création du user) : le user est créé avec `emailVerifiedAt: null` (ne rien passer, la colonne est nullable), **supprimer** la création de session/tokens, et appeler :
```ts
    await this.sendVerificationEmail({ id: user.id, email: user.email });
    return { status: "verification_sent" as const, email: user.email };
```

Ajouter la méthode privée :
```ts
  private async sendVerificationEmail(user: { id: string; email: string }) {
    // Invalide les tokens en cours pour ce user (re-inscription / renvoi).
    await this.prisma.client.emailVerificationToken.deleteMany({
      where: { userId: user.id, usedAt: null }
    });
    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.client.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + AuthService.VERIFICATION_TTL_MS)
      }
    });
    const verifyUrl = `${env.APP_PUBLIC_URL}/auth/verify?token=${rawToken}`;
    const mail = buildVerificationEmail(verifyUrl);
    if (!env.MAIL_RESEND_API_KEY) {
      // En dev sans Resend, exposer le lien pour tester le flux localement.
      // eslint-disable-next-line no-console
      console.warn(`[auth:verify] lien de vérification pour ${user.email} → ${verifyUrl}`);
    }
    await this.mail.send({ to: [user.email], subject: mail.subject, html: mail.html, text: mail.text });
  }
```

- [ ] **Step 6 : Lancer le test (passe)**

Run: `cd apps/api && npx vitest run src/auth/auth.service.test.ts -t "register crée un compte non vérifié"`
Expected: PASS.

- [ ] **Step 7 : Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(auth): register sends email verification link instead of a session"
```

---

## Task 3 : Backend — `POST /auth/verify`

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.service.test.ts`

**Interfaces:**
- Consumes: `sendVerificationEmail` (Task 2), `signAccessToken`, `createSession` (existants).
- Produces: `AuthService.verifyEmail(payload, meta) → { accessToken, refreshToken }`.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
it("verifyEmail marque vérifié + ouvre une session", async () => {
  await service.register({ tenantSlug: "v2", tenantDisplayName: "V2", email: "a@v2.africa", password: "password123", acceptPrivacyPolicy: true });
  const user = await prisma.client.user.findFirst({ where: { email: "a@v2.africa" } });
  const raw = captureLastVerificationToken(); // helper ci-dessous
  const res = await service.verifyEmail({ token: raw });
  expect(res.accessToken).toBeTruthy();
  const fresh = await prisma.client.user.findUnique({ where: { id: user!.id } });
  expect(fresh?.emailVerifiedAt).not.toBeNull();
});

it("verifyEmail rejette un token réutilisé", async () => {
  await service.register({ tenantSlug: "v3", tenantDisplayName: "V3", email: "b@v3.africa", password: "password123", acceptPrivacyPolicy: true });
  const raw = captureLastVerificationToken();
  await service.verifyEmail({ token: raw });
  await expect(service.verifyEmail({ token: raw })).rejects.toThrow();
});

it("verifyEmail rejette un token inconnu", async () => {
  await expect(service.verifyEmail({ token: "0".repeat(64) })).rejects.toThrow();
});
```
Ajouter le helper de test (en haut du fichier, après les imports) :
```ts
import { createHash } from "crypto";
async function captureLastVerificationToken(): Promise<string> {
  // Le brut n'est pas stocké ; en test on régénère un token connu en réécrivant le hash.
  const rawToken = "testtoken" + Math.random().toString(16).slice(2).padEnd(48, "0");
  const last = await prisma.client.emailVerificationToken.findFirst({ orderBy: { createdAt: "desc" }, where: { usedAt: null } });
  await prisma.client.emailVerificationToken.update({
    where: { id: last!.id },
    data: { tokenHash: createHash("sha256").update(rawToken).digest("hex") }
  });
  return rawToken;
}
```

- [ ] **Step 2 : Lancer (échoue)**

Run: `cd apps/api && npx vitest run src/auth/auth.service.test.ts -t "verifyEmail"`
Expected: FAIL (`verifyEmail` n'existe pas).

- [ ] **Step 3 : Implémenter `verifyEmail`**

Ajouter le schéma en haut : `const verifyEmailSchema = z.object({ token: z.string().min(32) });`
Méthode :
```ts
  async verifyEmail(payload: unknown, meta?: SessionMeta) {
    const input = verifyEmailSchema.parse(payload);
    const tokenHash = this.hashToken(input.token);
    const token = await this.prisma.client.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!token || token.usedAt || token.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Lien de vérification invalide ou expiré.");
    }
    const user = await this.prisma.client.user.findUnique({ where: { id: token.userId } });
    if (!user) {
      throw new BadRequestException("Lien de vérification invalide ou expiré.");
    }
    await this.prisma.client.$transaction([
      this.prisma.client.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
      this.prisma.client.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })
    ]);
    const authUser: AuthUser = { userId: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
    const accessToken = await this.signAccessToken(authUser);
    const { refreshToken } = await this.createSession(authUser, undefined, meta);
    return { accessToken, refreshToken };
  }
```

- [ ] **Step 4 : Exposer la route dans le controller**

Dans `auth.controller.ts`, ajouter (même patron cookie que login) :
```ts
  @Post("verify")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verify(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.verifyEmail(body, extractSessionMeta(request));
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }
```

- [ ] **Step 5 : Lancer (passe)**

Run: `cd apps/api && npx vitest run src/auth/auth.service.test.ts -t "verifyEmail"`
Expected: PASS (3 tests).

- [ ] **Step 6 : Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(auth): POST /auth/verify confirms email and opens session"
```

---

## Task 4 : Backend — `POST /auth/resend-verification` + login bloquant

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.service.test.ts`

**Interfaces:**
- Consumes: `sendVerificationEmail` (Task 2).
- Produces: `AuthService.resendVerification(payload) → { status: "sent" }` ; `login` lève `ForbiddenException` (403) si `emailVerifiedAt` null.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
it("login bloque un compte non vérifié (403)", async () => {
  await service.register({ tenantSlug: "v4", tenantDisplayName: "V4", email: "c@v4.africa", password: "password123", acceptPrivacyPolicy: true });
  await expect(service.login({ email: "c@v4.africa", password: "password123", tenantSlug: "v4" })).rejects.toMatchObject({ status: 403 });
});

it("login réussit après vérification", async () => {
  await service.register({ tenantSlug: "v5", tenantDisplayName: "V5", email: "d@v5.africa", password: "password123", acceptPrivacyPolicy: true });
  const raw = await captureLastVerificationToken();
  await service.verifyEmail({ token: raw });
  const res = await service.login({ email: "d@v5.africa", password: "password123", tenantSlug: "v5" });
  expect(res.accessToken).toBeTruthy();
});

it("resendVerification répond neutre pour un email inconnu", async () => {
  await expect(service.resendVerification({ email: "ghost@nope.africa" })).resolves.toEqual({ status: "sent" });
});
```

- [ ] **Step 2 : Lancer (échoue)**

Run: `cd apps/api && npx vitest run src/auth/auth.service.test.ts -t "login bloque|login réussit après|resendVerification"`
Expected: FAIL.

- [ ] **Step 3 : Bloquer le login non vérifié**

Dans `login`, après la vérification réussie du mot de passe (`isValidPassword`) et **avant** de créer la session, insérer :
```ts
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException("Vérifiez votre email pour activer votre compte.");
    }
```
(Importer `ForbiddenException` depuis `@nestjs/common` — déjà utilisé ailleurs, l'ajouter à l'import existant.) Ne pas incrémenter le lockout dans ce cas (le mot de passe est correct).

- [ ] **Step 4 : Implémenter `resendVerification`**

Schéma : `const resendSchema = z.object({ email: z.string().email(), tenantSlug: z.string().min(3).max(60).optional() });`
```ts
  async resendVerification(payload: unknown) {
    const input = resendSchema.parse(payload);
    const email = input.email.toLowerCase();
    const users = await this.prisma.client.user.findMany({
      where: { email, ...(input.tenantSlug ? { tenant: { slug: input.tenantSlug.toLowerCase() } } : {}) },
      select: { id: true, email: true, emailVerifiedAt: true }
    });
    // Réponse neutre systématique (anti-énumération). N'envoie que si un seul
    // compte non vérifié correspond sans ambiguïté.
    const pending = users.filter((u) => !u.emailVerifiedAt);
    if (pending.length === 1) {
      await this.sendVerificationEmail({ id: pending[0]!.id, email: pending[0]!.email });
    }
    return { status: "sent" as const };
  }
```

- [ ] **Step 5 : Exposer la route resend**

Dans `auth.controller.ts` :
```ts
  @Post("resend-verification")
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  resendVerification(@Body() body: unknown) {
    return this.authService.resendVerification(body);
  }
```

- [ ] **Step 6 : Lancer (passe) + suite complète auth**

Run: `cd apps/api && npx vitest run src/auth/auth.service.test.ts`
Expected: PASS (toute la suite auth verte).

- [ ] **Step 7 : Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(auth): resend-verification endpoint + login blocks unverified accounts"
```

---

## Task 5 : Front — exporter Dialog + `<AuthModal>` + contexte

**Files:**
- Modify: `apps/web/components/ui/index.ts`
- Create: `apps/web/components/auth/use-auth-modal.tsx`
- Create: `apps/web/components/auth/auth-modal.tsx`

**Interfaces:**
- Consumes: `Dialog, DialogContent, DialogHeader, DialogTitle` (de `./dialog`), `apiFetch, ApiError`, `setStoredToken`, `useI18n`, `Button, Input, FormError, Checkbox`.
- Produces: `<AuthModalProvider>`, `useAuthModal() → { open: (view: "login"|"register") => void; close: () => void }`, `<AuthModal>` (rendu par le provider).

- [ ] **Step 1 : Exporter les primitives Dialog**

Dans `apps/web/components/ui/index.ts`, ajouter :
```ts
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "./dialog";
```

- [ ] **Step 2 : Créer le contexte du modal**

`apps/web/components/auth/use-auth-modal.tsx` :
```tsx
"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type AuthView = "login" | "register" | "check-email";
type Ctx = { view: AuthView | null; email: string; open: (v: "login" | "register") => void; setView: (v: AuthView, email?: string) => void; close: () => void };
const AuthModalContext = createContext<Ctx | null>(null);

export function AuthModalProvider({ children, render }: { children: ReactNode; render: (ctx: Ctx) => ReactNode }) {
  const [view, setViewState] = useState<AuthView | null>(null);
  const [email, setEmail] = useState("");
  const open = useCallback((v: "login" | "register") => setViewState(v), []);
  const setView = useCallback((v: AuthView, e?: string) => { if (e !== undefined) setEmail(e); setViewState(v); }, []);
  const close = useCallback(() => setViewState(null), []);
  const value = useMemo<Ctx>(() => ({ view, email, open, setView, close }), [view, email, open, setView, close]);
  return <AuthModalContext.Provider value={value}>{children}{render(value)}</AuthModalContext.Provider>;
}
export function useAuthModal() {
  const c = useContext(AuthModalContext);
  if (!c) throw new Error("useAuthModal must be used within AuthModalProvider");
  return c;
}
```

- [ ] **Step 3 : Créer `<AuthModal>` (3 vues)**

`apps/web/components/auth/auth-modal.tsx` — composant qui reçoit la vue courante et rend le bon formulaire. Reprend la logique de soumission de `login/page.tsx` (login → `/auth/me` → redirect) et `register/page.tsx` (register → bascule `check-email`), plus la vue `check-email`. Points clés :
```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../lib/api";
import { setStoredToken } from "../../lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, FormError, Checkbox } from "@/components/ui";
import { useAuthModal } from "./use-auth-modal";

export function AuthModal() {
  const { view, email: pendingEmail, setView, close } = useAuthModal();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState("");
  const [needsResend, setNeedsResend] = useState(false);
  const [loading, setLoading] = useState(false);
  if (!view) return null;

  const doLogin = async () => {
    setError(""); setNeedsResend(false); setLoading(true);
    try {
      const r = await apiFetch<{ accessToken: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setStoredToken(r.accessToken);
      const me = await apiFetch<{ role: string }>("/auth/me", { headers: { Authorization: `Bearer ${r.accessToken}` } });
      close();
      router.push(me.role.startsWith("PLATFORM") ? "/admin" : "/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setNeedsResend(true); setError("Vérifiez votre email pour activer votre compte."); }
      else setError(e instanceof Error ? e.message : "Échec de connexion.");
    } finally { setLoading(false); }
  };

  const doRegister = async () => {
    setError(""); setLoading(true);
    try {
      const slug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await apiFetch<{ status: string; email: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ tenantSlug: slug, tenantDisplayName: orgName.trim(), email: email.trim(), password, acceptPrivacyPolicy: true })
      });
      setView("check-email", email.trim());
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError("Ce nom d'organisation est déjà utilisé.");
      else setError(e instanceof Error ? e.message : "La création du compte a échoué.");
    } finally { setLoading(false); }
  };

  const doResend = async (target: string) => {
    await apiFetch("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: target }) }).catch(() => undefined);
  };

  return (
    <Dialog open={!!view} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {view === "login" ? "Connexion" : view === "register" ? "Créer un compte" : "Vérifiez votre email"}
          </DialogTitle>
        </DialogHeader>

        {view === "check-email" ? (
          <div className="space-y-4">
            <p>Un lien de confirmation a été envoyé à <strong>{pendingEmail}</strong>. Ouvrez-le pour activer votre compte.</p>
            <Button variant="outline" onClick={() => doResend(pendingEmail)}>Renvoyer le lien</Button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); view === "login" ? doLogin() : doRegister(); }} className="space-y-4" noValidate>
            {view === "register" && (
              <Input id="orgName" label="Nom de l'organisation" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            )}
            <Input id="email" type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input id="password" type="password" label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {view === "register" && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={accept} onCheckedChange={(c) => setAccept(c === true)} /> J'accepte la politique de confidentialité.
              </label>
            )}
            <FormError>{error}</FormError>
            {needsResend && <Button type="button" variant="outline" onClick={() => doResend(email)}>Renvoyer le lien de vérification</Button>}
            <Button type="submit" loading={loading} disabled={view === "register" && !accept} className="w-full">
              {view === "login" ? "Se connecter" : "Créer mon compte"}
            </Button>
            <button type="button" className="text-sm text-primary underline" onClick={() => setView(view === "login" ? "register" : "login")}>
              {view === "login" ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4 : Vérifier la compilation TypeScript**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 erreur (ajuster les props `Input`/`Checkbox` si l'API diffère — voir `login/page.tsx` pour les noms exacts).

- [ ] **Step 5 : Commit**

```bash
git add apps/web/components
git commit -m "feat(web): unified AuthModal (login/register/check-email) + provider"
```

---

## Task 6 : Front — routes wrappers + page `/auth/verify` + montage du provider

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/register/page.tsx`
- Create: `apps/web/app/auth/verify/page.tsx`
- Modify: le layout public qui rend le header (monter `AuthModalProvider` + `<AuthModal/>`).

**Interfaces:**
- Consumes: `AuthModalProvider`, `AuthModal`, `useAuthModal` (Task 5), `apiFetch`, `setStoredToken`.

- [ ] **Step 1 : `/auth/verify` (page de confirmation)**

`apps/web/app/auth/verify/page.tsx` :
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { setStoredToken } from "../../../lib/auth";

export default function VerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"verifying" | "error">("verifying");
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // évite le double-appel en dev StrictMode (token single-use)
    ran.current = true;
    const token = params.get("token");
    if (!token) { setState("error"); return; }
    apiFetch<{ accessToken: string }>("/auth/verify", { method: "POST", body: JSON.stringify({ token }) })
      .then((r) => { setStoredToken(r.accessToken); router.replace("/dashboard"); })
      .catch(() => setState("error"));
  }, [params, router]);
  if (state === "verifying") return <main className="grid min-h-dvh place-items-center">Confirmation en cours…</main>;
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Lien invalide ou expiré</h1>
        <a href="/login" className="text-primary underline">Retour à la connexion (renvoyer un lien)</a>
      </div>
    </main>
  );
}
```
> Note single-use : le garde `ran.current` empêche le double POST du StrictMode dev qui invaliderait le token au 1er appel.

- [ ] **Step 2 : Réduire `/login` et `/register` en wrappers**

Remplacer le contenu de `apps/web/app/login/page.tsx` par un composant qui ouvre la vue `login` du modal en présentation plein écran :
```tsx
"use client";
import { useEffect } from "react";
import { AuthModalProvider, useAuthModal } from "../../components/auth/use-auth-modal";
import { AuthModal } from "../../components/auth/auth-modal";
function Opener({ view }: { view: "login" | "register" }) {
  const { open } = useAuthModal();
  useEffect(() => { open(view); }, [open, view]);
  return null;
}
export default function LoginPage() {
  return <AuthModalProvider render={() => <AuthModal />}><Opener view="login" /></AuthModalProvider>;
}
```
Faire l'équivalent pour `register/page.tsx` avec `view="register"`.

- [ ] **Step 3 : Monter le provider global sur le header public**

Dans le composant qui rend le header public (là où figurent les liens « Connexion »/« S'inscrire »), envelopper avec `AuthModalProvider render={() => <AuthModal/>}` et remplacer les `<Link href="/login">` par `onClick={() => open("login")}` (garder `/register` accessible en lien direct pour le SEO). Suivre le composant header existant (`components/*header*`).

- [ ] **Step 4 : Vérifier compilation + build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: build OK.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/app apps/web/components
git commit -m "feat(web): auth routes render AuthModal + /auth/verify confirmation page"
```

---

## Task 7 : E2E, doc testeurs, prérequis déploiement

**Files:**
- Create: `apps/web/e2e/auth-verification.spec.ts` (ou dossier E2E existant)
- Modify: `docs/GUIDE_TESTEURS.md`
- Modify: `render.yaml`

- [ ] **Step 1 : Écrire l'E2E (parcours complet en dev)**

Test Playwright : ouvrir `/register`, remplir, soumettre → vue « Vérifiez votre email ». Récupérer l'URL de vérif depuis les logs API (le `console.warn` en dev), naviguer dessus → attendre l'URL `/dashboard`. Puis test : login d'un compte non vérifié → message + bouton renvoyer.
> Rappel gotcha (mémoire e2e-run-gotchas) : lancer avec `E2E_API_BASE_URL=http://localhost:3011` et browsers headless-shell.

- [ ] **Step 2 : Lancer l'E2E**

Run: `cd apps/web && E2E_API_BASE_URL=http://localhost:3011 npx playwright test auth-verification`
Expected: PASS.

- [ ] **Step 3 : Doc testeurs**

Dans `docs/GUIDE_TESTEURS.md`, à l'étape inscription, ajouter : « Après avoir créé votre compte, **ouvrez le lien de confirmation reçu par email** pour l'activer. Les comptes démo (`organisateur@`/`equipe@demovote.africa`) sont déjà activés. »

- [ ] **Step 4 : Prérequis déploiement Render**

Dans `render.yaml`, sous `envVars`, ajouter :
```yaml
      - key: MAIL_RESEND_API_KEY
        sync: false
      - key: MAIL_FROM
        value: SHADOMA Votes <noreply@shadowa.votes>
```
> ⚠️ Renseigner la vraie clé Resend dans le dashboard Render **avant** de déployer, sinon les emails de vérification ne partiront pas et le signup testeur sera bloqué.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/e2e docs/GUIDE_TESTEURS.md render.yaml
git commit -m "test(auth): e2e email verification flow + testers guide + Render mail env"
```

---

## Self-Review (effectuée)

- **Couverture spec :** §2 modèle → Task 1 ; §3.1 register → Task 2 ; §3.2 verify → Task 3 ; §3.3 resend + §3.4 login → Task 4 ; §4 modals + verify page → Tasks 5-6 ; §5 email + prérequis → Tasks 2 & 7 ; §7 tests → Tasks 2-4, 7. ✅
- **Placeholders :** aucun ; code complet à chaque étape.
- **Cohérence des types :** `register → {status, email}` (Task 2) consommé par `AuthModal.doRegister` (Task 5) ; `verifyEmail → {accessToken, refreshToken}` (Task 3) exposé en `{accessToken}` par le controller, consommé par `/auth/verify` (Task 6) ; `sendVerificationEmail({id,email})` défini Task 2, réutilisé Task 4. ✅
- **Point d'attention implémenteur :** vérifier les noms de props exacts de `Input`/`Checkbox`/`Button` dans `login/page.tsx` avant de coder le modal (Task 5, Step 4).
