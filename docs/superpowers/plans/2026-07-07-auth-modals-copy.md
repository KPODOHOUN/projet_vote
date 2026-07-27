# Auth hardening + modals + copy rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les failles réelles du flux auth, passer login/register en modals réutilisant la logique des pages, et réécrire le texte de la plateforme en version minimaliste bilingue.

**Architecture:** Backend NestJS (auth.service Zod schemas + audit log). Front Next.js 15 App Router : extraction des formulaires en composants partagés consommés par pages ET modal ; réécriture éditoriale sans toucher à la logique. SebPay hors périmètre.

**Tech Stack:** NestJS, Prisma, Zod, jose, bcryptjs, node:test ; Next.js 15, React 19, Tailwind v4, shadcn/Radix, framer-motion, i18n maison (`useI18n()`).

## Global Constraints

- ZERO fake data, ZERO placeholder, ZERO hallucination technique (règle projet globale).
- TypeScript strict.
- Chaque composant front gère : loading, empty, error, success.
- Bilingue FR/EN conservé partout (aucune clé i18n orpheline).
- Ne pas modifier la logique de paiement (déjà solide). SebPay hors périmètre.
- Politique mot de passe renforcée s'applique aux **nouveaux** mots de passe (register + reset) uniquement ; le login continue d'accepter les mots de passe existants.
- Grandfathering des comptes existants **assumé** (décision produit) → ADR, pas de code.

### Corrections apportées au spec après lecture du code réel
- `MailService.send()` logge **déjà** les échecs en `error` (mail.service.ts:44,50). Pas de rewrite — hardening mineur seulement.
- `registerSchema` a **déjà** `.max(72)` (auth.service.ts:20). Pas de troncature silencieuse. Seuls min-length + complexité manquent.

### Contrainte de vérification
Les tests auth (`auth.service.test.ts`) tournent sur une **vraie base Postgres de test** (`assertTestDatabase`, `test-utils/db`). Si la DB de test n'est pas disponible dans l'environnement d'exécution, les nouveaux tests sont écrits mais leur exécution est **différée** et signalée explicitement (jamais marquée « passée » sans preuve). Le typecheck (`tsc`) reste exécutable et sert de garde-fou.

---

## Task 1 : Politique de mot de passe (register + reset)

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts` (schemas lignes 16-58)
- Test: `apps/api/src/auth/auth.service.test.ts`

**Interfaces:**
- Produces: un helper `strongPassword` (schéma Zod réutilisable) appliqué à `registerSchema.password`, `resetPasswordSchema.password`, `acceptInvitationSchema.password`. Règle : longueur 10..72, au moins 2 classes parmi [minuscule, MAJUSCULE, chiffre, symbole]. Messages FR.
- `loginSchema.password` reste `.min(8).max(72)` (accepte l'existant).

- [ ] **Step 1 : Écrire les tests d'échec**

```ts
test("register refuse un mot de passe trop court (<10)", async () => {
  await resetDatabase();
  await assert.rejects(
    authService.register({
      tenantSlug: "pw-short", tenantDisplayName: "PW Short",
      email: "a@pw-short.africa", password: "Ab1cdef", acceptPrivacyPolicy: true as const
    }),
    /10 caract|au moins/i
  );
});

test("register refuse un mot de passe sans diversité (une seule classe)", async () => {
  await resetDatabase();
  await assert.rejects(
    authService.register({
      tenantSlug: "pw-weak", tenantDisplayName: "PW Weak",
      email: "a@pw-weak.africa", password: "aaaaaaaaaa", acceptPrivacyPolicy: true as const
    }),
    /classe|caract/i
  );
});

test("register accepte un mot de passe robuste", async () => {
  await resetDatabase();
  const res = await authService.register({
    tenantSlug: "pw-ok", tenantDisplayName: "PW OK",
    email: "a@pw-ok.africa", password: "SecurePass123!", acceptPrivacyPolicy: true as const
  });
  assert.ok(res);
});
```

- [ ] **Step 2 : Lancer les tests (attendu : FAIL)**

Run: `cd apps/api && node --test --import tsx src/auth/auth.service.test.ts`
Expected: FAIL (les mots de passe faibles sont actuellement acceptés). Si la DB de test manque : noter « exécution différée ».

- [ ] **Step 3 : Implémenter le schéma `strongPassword`**

Remplacer dans `auth.service.ts` (après les imports zod) :

```ts
// Politique appliquée aux NOUVEAUX mots de passe (inscription, reset, invitation).
// Le login garde .min(8) pour accepter les mots de passe existants.
const strongPassword = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(72, "Le mot de passe ne peut pas dépasser 72 caractères.")
  .refine(
    (v) => {
      const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(v)).length;
      return classes >= 2;
    },
    "Le mot de passe doit combiner au moins deux types de caractères (minuscule, majuscule, chiffre ou symbole)."
  );
```

Puis dans `registerSchema` : `password: strongPassword,`
Dans `resetPasswordSchema` : `password: strongPassword`
Dans `acceptInvitationSchema` : `password: strongPassword`
Laisser `loginSchema.password: z.string().min(8).max(72)` inchangé.

- [ ] **Step 4 : Lancer les tests (attendu : PASS)**

Run: `cd apps/api && node --test --import tsx src/auth/auth.service.test.ts`
Expected: PASS (ou exécution différée si pas de DB — dans ce cas exécuter au moins `cd apps/api && npx tsc --noEmit`).

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.test.ts
git commit -m "feat(auth): politique mot de passe renforcée (register/reset/invitation)"
```

---

## Task 2 : Audit log sur login (succès + échec)

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts` (méthode `login`, lignes 195-266)
- Test: `apps/api/src/auth/auth.service.test.ts`

**Interfaces:**
- Consumes: `this.prisma.client.auditLog.create` (déjà utilisé lignes 289-301, 387-397).
- Produces: écriture `AuditLog` avec `action: "auth.login"` (succès) et `action: "auth.login_failed"` (mauvais mot de passe / user absent), best-effort (`.catch(() => undefined)`), metadata non sensible `{ ip, userAgent }`. tenantId = tenant.id quand connu.

- [ ] **Step 1 : Écrire le test**

```ts
test("login écrit un audit log succès et échec", async () => {
  await assert.rejects(
    authService.login({ tenantSlug: credentials.tenantSlug, email: credentials.email, password: "WrongPass999!" }),
    /Identifiants invalides/
  );
  await authService.login(
    { tenantSlug: credentials.tenantSlug, email: credentials.email, password: credentials.password },
    { userAgent: "AuditAgent/1.0", ipAddress: "203.0.113.9" }
  );
  const ok = await prisma.auditLog.findMany({ where: { action: "auth.login" } });
  const ko = await prisma.auditLog.findMany({ where: { action: "auth.login_failed" } });
  assert.ok(ok.length >= 1);
  assert.ok(ko.length >= 1);
});
```

- [ ] **Step 2 : Lancer (attendu : FAIL)**

Run: `cd apps/api && node --test --import tsx src/auth/auth.service.test.ts`
Expected: FAIL (aucun audit login aujourd'hui). DB absente → différer.

- [ ] **Step 3 : Implémenter**

Ajouter un helper privé dans `AuthService` :

```ts
private async auditLogin(
  action: "auth.login" | "auth.login_failed",
  tenantId: string | null,
  userId: string | null,
  meta?: SessionMeta
) {
  if (!tenantId) return;
  await this.prisma.client.auditLog
    .create({
      data: {
        tenantId,
        actorUserId: userId,
        actorRole: UserRole.ORGANIZER_OWNER,
        action,
        targetType: "User",
        targetId: userId ?? "unknown",
        metadata: { ip: meta?.ipAddress ?? null, userAgent: meta?.userAgent ?? null }
      }
    })
    .catch(() => undefined);
}
```

Dans `login`, aux 3 points d'échec mot de passe/user (après chaque `recordFailedLogin`, avant le `throw`), appeler `await this.auditLogin("auth.login_failed", tenant?.id ?? null, user?.id ?? null, meta);` (adapter la variable disponible à chaque point). Avant le `return { accessToken, refreshToken }` final : `await this.auditLogin("auth.login", user.tenantId, user.id, meta);`

*Note d'implémentation : au point d'échec « tenant introuvable » (ligne 223-225), tenantId est null → l'audit est simplement ignoré (helper return early). C'est acceptable : sans tenant on n'a pas de scope d'audit.*

- [ ] **Step 4 : Lancer (attendu : PASS ou différé + tsc)**

Run: `cd apps/api && node --test --import tsx src/auth/auth.service.test.ts` puis `npx tsc --noEmit`

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.test.ts
git commit -m "feat(auth): audit log des connexions réussies et échouées"
```

---

## Task 3 : Hardening mineur MailService + ADR grandfathering

**Files:**
- Modify: `apps/api/src/mail/mail.service.ts` (message dev déjà loggé — ajuster niveau si besoin)
- Create: `docs/adr/ADR-018-email-verification-grandfathering.md`

- [ ] **Step 1 : Vérifier le comportement mail actuel**

Constat : `send()` logge déjà `logger.error` sur échec Resend (lignes 44, 50) et `logger.warn` si clé absente. Aucun rewrite nécessaire. Seule amélioration : garantir qu'un échec en **production** (clé présente mais Resend KO) est visible. C'est déjà le cas via `logger.error`. → Pas de changement de code requis ; documenter dans l'ADR que l'inscription reste best-effort avec resend disponible.

- [ ] **Step 2 : Écrire l'ADR**

Créer `docs/adr/ADR-018-email-verification-grandfathering.md` :

```markdown
# ADR-018 — Grandfathering de la vérification e-mail

## Statut
Accepté — 2026-07-07

## Contexte
La feature de vérification e-mail (migration 20260706180000_auth_email_tokens)
inclut un backfill : `UPDATE "User" SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL`. Tous les comptes créés avant la feature sont
donc marqués vérifiés.

## Décision
On assume ce grandfathering. Les comptes antérieurs restent vérifiés et peuvent
se connecter sans re-vérification. Tout nouveau compte passe par le flux normal
(login bloqué tant que `emailVerifiedAt` est null).

Justification : la plateforme est en phase de déploiement test (seed multi-rôles
récent), le volume de comptes réels antérieurs est faible/nul, et forcer une
re-vérification dépendrait de la fiabilité de l'envoi e-mail (Resend), qui est
best-effort.

## Conséquences
- Pas de code de migration supplémentaire.
- L'envoi d'e-mail reste best-effort : `MailService.send()` ne lève pas et logge
  les échecs en `error`. La page `check-email` offre un renvoi throttlé (5/min).
- Si un jour un afflux de comptes réels antérieurs pose problème, un script
  ciblé pourra repasser des comptes précis à non-vérifié (hors périmètre).
```

- [ ] **Step 3 : Commit**

```bash
git add docs/adr/ADR-018-email-verification-grandfathering.md
git commit -m "docs(adr): grandfathering de la vérification e-mail (ADR-018)"
```

---

## Task 4 : Exporter Dialog + extraire LoginForm/RegisterForm

**Files:**
- Modify: `apps/web/components/ui/index.ts`
- Create: `apps/web/components/auth/login-form.tsx`
- Create: `apps/web/components/auth/register-form.tsx`
- Modify: `apps/web/app/login/page.tsx` (consomme `LoginForm`)
- Modify: `apps/web/app/register/page.tsx` (consomme `RegisterForm`)

**Interfaces:**
- Produces:
  - `Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogOverlay` réexportés depuis `@/components/ui`.
  - `LoginForm` props : `{ onSuccess?: () => void; compact?: boolean }`. Contient toute la logique existante de `login/page.tsx` (email, password, tenant code, lockout, org-code mémorisé, show/hide password, gestion 403 email-non-vérifié).
  - `RegisterForm` props : `{ onSuccess?: () => void; compact?: boolean }`. Logique de `register/page.tsx` (org name, email, password, privacy checkbox, dérivation slug, redirection `/check-email`).
- Les pages passent `compact={false}` et gardent `AuthSplitLayout`. Le modal (Task 5) passera `compact` et un `onSuccess` qui ferme le dialog + `router.refresh()`.

- [ ] **Step 1 : Exporter Dialog dans `ui/index.ts`**

Ajouter à la fin de `apps/web/components/ui/index.ts` :

```ts
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogOverlay,
} from "./dialog";
```

*(vérifier au préalable les exports réels de `dialog.tsx` et n'exporter que ceux qui existent).*

- [ ] **Step 2 : Extraire `LoginForm`**

Créer `apps/web/components/auth/login-form.tsx` : déplacer le JSX + hooks du formulaire actuel de `login/page.tsx` (tout sauf le `AuthSplitLayout` wrapper). Ajouter la prop `onSuccess`. Après un login réussi : si `onSuccess` fourni, l'appeler ; sinon comportement actuel (redirection dashboard).

- [ ] **Step 3 : Extraire `RegisterForm`**

Idem à partir de `register/page.tsx`. Après succès (`requiresEmailVerification`) : rediriger vers `/check-email` (comportement actuel) ; `onSuccess` appelé si fourni.

- [ ] **Step 4 : Rebrancher les pages**

`login/page.tsx` rend `<AuthSplitLayout ...><LoginForm /></AuthSplitLayout>`.
`register/page.tsx` rend `<AuthSplitLayout ...><RegisterForm /></AuthSplitLayout>`.

- [ ] **Step 5 : Typecheck + build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: succès. Corriger toute régression de types.

- [ ] **Step 6 : Commit**

```bash
git add apps/web/components/ui/index.ts apps/web/components/auth/ apps/web/app/login/page.tsx apps/web/app/register/page.tsx
git commit -m "refactor(web): extraction LoginForm/RegisterForm + export Dialog"
```

---

## Task 5 : AuthDialog + branchement header/landing

**Files:**
- Create: `apps/web/components/auth/auth-dialog.tsx`
- Modify: `apps/web/components/app-header.tsx`
- Modify: `apps/web/app/page.tsx` (CTA d'ouverture du modal)

**Interfaces:**
- Consumes: `LoginForm`, `RegisterForm` (Task 4), `Dialog*` (Task 4).
- Produces: `AuthDialog` props `{ open: boolean; onOpenChange: (o: boolean) => void; initialMode?: "login" | "register" }`. Onglets login/register, focus trap via Radix, ferme au succès.

- [ ] **Step 1 : Créer `AuthDialog`**

`apps/web/components/auth/auth-dialog.tsx` : `Dialog` contrôlé, état `mode` (login|register) initialisé par `initialMode`, bascule via deux boutons/onglets, rend `LoginForm`/`RegisterForm` avec `compact` + `onSuccess={() => onOpenChange(false)}`. États error/loading délégués aux forms.

- [ ] **Step 2 : Brancher le header**

`app-header.tsx` : ajouter un état local `authOpen`/`authMode`, les boutons « Connexion » et « Créer un compte » ouvrent `AuthDialog` avec le bon `initialMode` au lieu de `<Link href="/login">`. Garder les liens comme fallback `<a>` accessible si JS off (progressive enhancement : le bouton reste un lien vers /login/register mais `onClick` preventDefault + ouvre le modal).

- [ ] **Step 3 : Brancher la landing**

`app/page.tsx` : les CTA hero/final ouvrent `AuthDialog` (register par défaut). Réutiliser le même pattern que le header.

- [ ] **Step 4 : Typecheck + build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: succès.

- [ ] **Step 5 : Vérification manuelle (documentée)**

Lancer l'app web (dev), vérifier : ouverture modal depuis header + landing, bascule login↔register, succès ferme le modal, `/login` et `/register` directs OK, liens e-mail toujours sur pages. Consigner le résultat.

- [ ] **Step 6 : Commit**

```bash
git add apps/web/components/auth/auth-dialog.tsx apps/web/components/app-header.tsx apps/web/app/page.tsx
git commit -m "feat(web): modals de connexion/inscription (AuthDialog) depuis header et landing"
```

---

## Task 6 : Réécriture minimaliste du texte

**Files:**
- Modify: `apps/web/app/page.tsx` (landing)
- Modify: `apps/web/components/how-it-works.tsx`
- Modify: `apps/web/components/auth-marketing-aside.tsx`
- Modify: (si nécessaire) `apps/web/app/vote/page.tsx`, textes d'aide dashboard
- Modify: la source i18n FR/EN utilisée par `useI18n()` (à localiser : chercher `useI18n` et le dictionnaire)

**Interfaces:**
- Consumes: structure i18n existante (`useI18n()`).
- Produces: textes condensés FR + EN, sections landing ramenées de ~10 à 5-6.

- [ ] **Step 1 : Localiser le dictionnaire i18n**

Run: `cd apps/web && grep -rl "useI18n" app components lib | head` puis lire la définition du dictionnaire (clés FR/EN). Toute réécriture doit modifier les DEUX langues.

- [ ] **Step 2 : Réécrire la landing**

Restructurer `page.tsx` en 5-6 sections : Hero (titre 1 ligne + sous-titre 1 phrase + 2 CTA), Comment ça marche (4 étapes 1 phrase), Moyens de paiement (showcase sans laïus), Offres (2 cartes descriptions courtes), FAQ courte (3-4 Q/R 1 phrase), CTA final. Fusionner/supprimer « Operational Visibility », « Partner Growth Model », « Trust & Compliance » en une bande de 3 points courts. Garder Testimonials seulement si utile.

- [ ] **Step 3 : Raccourcir asides + écrans app**

`auth-marketing-aside.tsx` : 2-3 bullets courts. Alléger textes verbeux de `vote/page.tsx` et aides dashboard sans toucher la logique.

- [ ] **Step 4 : Vérifier l'absence de clés orphelines + build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Vérifier manuellement le rendu FR et EN (desktop + mobile), qu'aucune clé i18n n'est manquante.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/app/page.tsx apps/web/components/how-it-works.tsx apps/web/components/auth-marketing-aside.tsx apps/web/app/vote/page.tsx
git commit -m "refactor(web): réécriture minimaliste du texte (landing, asides, écrans app)"
```

---

## Self-Review

**Spec coverage :**
- Volet 1 audit/correction → Tasks 1 (mot de passe), 2 (audit login), 3 (mail + ADR grandfathering pour faille A). Failles B/C requalifiées après lecture du code (déjà gérées) — documenté.
- Volet 2 modals → Tasks 4 (extraction + export Dialog) et 5 (AuthDialog + branchement). Pages e-mail non touchées. ✓
- Volet 3 texte → Task 6. Bilingue conservé. ✓
- SebPay → hors périmètre, explicite. ✓

**Placeholder scan :** code réel fourni à chaque step ; pas de TODO/TBD. Task 6 dépend de la localisation du dictionnaire i18n (Step 1) car sa structure exacte n'est pas encore connue — c'est une étape de découverte légitime, pas un placeholder de code.

**Type consistency :** `strongPassword` (Task 1) réutilisé aux 3 schémas. `auditLogin` signature fixée (Task 2). `LoginForm`/`RegisterForm` props `{ onSuccess?, compact? }` cohérentes entre Tasks 4 et 5. `AuthDialog` props cohérentes.

**Constraint de test :** exécution des tests API différée si pas de DB — signalée, jamais faussement « passée ».
