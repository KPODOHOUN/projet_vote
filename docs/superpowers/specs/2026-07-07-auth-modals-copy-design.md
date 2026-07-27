# Design — Audit auth, modals de connexion, réécriture minimaliste du texte

Date : 2026-07-07
Branche : `feat/multi-psp-payouts`
Statut : proposé

## Contexte

Demande initiale (4 volets) :
1. Vérification approfondie du code d'inscription / connexion.
2. Ajouter la vérification par e-mail après inscription.
3. Passer inscription et connexion en **modals** plutôt qu'en pages pleines (réduire le travail front).
4. Réduire le texte sur la plateforme (« trop de texte, ne donne pas envie »).
5. Vérifier les moyens de paiement et ajouter **SebPay**.

### Décisions de cadrage prises avec l'utilisateur

- **Vérification e-mail** : elle **existe déjà** et est câblée de bout en bout (fichiers non suivis par git : `apps/api/src/auth/auth-email.util.ts`, migration `20260706180000_auth_email_tokens`, pages `check-email/`, `verify-email/`, `forgot-password/`, `reset-password/`). Le vrai travail demandé est donc **auditer + corriger les failles**, pas réimplémenter.
- **Modals** : login/register en modals, mais **les flux par e-mail restent des pages** (verify-email, reset-password, forgot-password, check-email — ils arrivent par lien e-mail). `/login` et `/register` restent accessibles en pages (fallback direct / SEO / refresh).
- **Texte** : **réécriture minimaliste complète**, ton SaaS concis. Bilingue FR/EN conservé.
- **Comptes existants (faille A)** : **grandfathering assumé** — les comptes créés avant la feature restent vérifiés ; on documente le choix dans un ADR.
- **SebPay** : **mis de côté**. La doc technique n'est pas accessible publiquement (site `sebpay.bj` : la « Référence API » `/api` renvoie 404 aux fetchers, les autres sections sont des liens placeholder `#`, les clés/webhooks sont derrière login sur `new.sebpay.bj`). Règle projet « ZERO fake data » → on n'invente pas d'endpoints. Hors périmètre de ce spec ; on câblera quand la spec réelle sera fournie.

### État vérifié du code (références)

**Auth API** — `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`, `auth-email.util.ts`, `mail.service.ts` :
- Inscription `POST /api/v1/auth/register` : bcryptjs cost 12, rôle `ORGANIZER_OWNER`, création tenant, e-mail de vérification (token `randomBytes(32)`, hash SHA-256, TTL 24 h).
- Connexion `POST /api/v1/auth/login` : lockout DB 5 tentatives / 15 min, JWT HS256 (15 min) + refresh token `randomBytes(48)` haché SHA-256 (30 j) avec rotation et détection de réutilisation.
- Reset mot de passe : token 1 h, révoque toutes les sessions, anti-énumération.

**Front web** (Next.js 15 App Router, Tailwind v4, shadcn/Radix) :
- `Dialog` Radix présent dans `apps/web/components/ui/dialog.tsx` mais **non exporté** dans `ui/index.ts`.
- login/register/vote = pages pleines via `AuthSplitLayout` + `AuthMarketingAside`.
- Landing `apps/web/app/page.tsx` : ~450 lignes, ~10 sections, ~900-1000 mots — très verbeux.

**Paiements** (contexte, hors modif) : abstraction propre `PspGateway` + `PspRegistry`, providers FeexPay / KkiaPay / FedaPay. Placeholder `SEDPAY` (distinct de SebPay) dans `apps/web/lib/payment-providers.ts`, `available: false`.

## Périmètre de ce spec

Trois volets. SebPay explicitement **hors périmètre**.

---

## Volet 1 — Audit & correction de l'authentification

Le flux est solide. On corrige uniquement les failles réelles trouvées à l'audit.

### A. Comptes existants marqués vérifiés (backfill) — **décision : grandfathering**
- La migration `20260706180000_auth_email_tokens/migration.sql` exécute
  `UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL`.
- **Action** : aucune modification de code. Rédiger un ADR (`docs/adr/`) documentant le grandfathering assumé : les comptes antérieurs à la feature sont considérés vérifiés ; tout nouveau compte passe par la vérification normale.

### B. `MailService.send()` échoue en silence — **corriger**
- `mail.service.ts` : `send()` retourne un booléen et ne throw jamais. Si Resend échoue, l'inscription réussit mais l'e-mail ne part pas → utilisateur bloqué au login (email non vérifié) sans recours clair.
- **Action** :
  - Logger l'échec en niveau `error` avec contexte (destinataire masqué, purpose) — pas de fuite de token dans les logs.
  - Le flux d'inscription reste non bloquant (on ne fait pas échouer l'inscription), mais l'UX `check-email` doit exposer clairement un bouton **renvoyer l'e-mail** fiable (déjà présent, throttlé 5/min) et un message si l'envoi initial a échoué.
  - Vérifier que `resend-verification` reste disponible même quand l'envoi initial a échoué.

### C. Politique de mot de passe — **corriger**
- Aujourd'hui : 8 caractères min, aucune contrainte, troncature silencieuse à 72 (limite bcrypt).
- **Action** dans le schéma Zod (`auth.service.ts`) :
  - Rejeter explicitement les mots de passe > 72 caractères (message clair) au lieu d'une troncature silencieuse.
  - Relever le minimum à **10 caractères** et exiger un minimum de robustesse simple (au moins deux classes parmi : minuscule / majuscule / chiffre / symbole). Pas de dépendance lourde type zxcvbn (YAGNI) ; validation légère et messages FR/EN explicites.
  - Appliquer la même politique côté **reset-password** (`reset-password/page.tsx` valide actuellement 8+).

### D. Absence d'audit sur le login — **corriger**
- Seul `auth.refresh_token_reuse_detected` est audité.
- **Action** : écrire un `AuditLog` sur login réussi (`auth.login`) et échoué (`auth.login_failed`), avec metadata non sensible (tenantSlug, ip, userAgent). Réutiliser le service d'audit existant.

### Hors périmètre (notés « plus tard » dans le spec, pas d'implémentation)
- 2FA/TOTP.
- Job de purge des `AuthEmailToken` expirés.
- Throttle léger sur `GET /auth/me`.

### Tests
- Étendre `auth.service.test.ts` : mot de passe > 72 rejeté, mot de passe faible rejeté, mot de passe valide accepté ; audit log émis sur login OK/KO ; comportement quand `MailService.send()` retourne `false` (inscription réussit, échec loggé).

---

## Volet 2 — Modals login / register

### Principe : extraire la logique de formulaire, la partager entre modal et page (zéro duplication)

1. **Exporter `Dialog`** et ses sous-composants dans `apps/web/components/ui/index.ts` (aujourd'hui seul `ConfirmDialog` est exporté).
2. **Extraire deux composants de formulaire réutilisables** à partir du contenu actuel des pages :
   - `apps/web/components/auth/login-form.tsx` — contient la logique existante de `login/page.tsx` (email, password, tenant code, lockout, org-code mémorisé, show/hide password, gestion 403 email-non-vérifié).
   - `apps/web/components/auth/register-form.tsx` — logique de `register/page.tsx` (org name, email, password, privacy checkbox, dérivation slug, redirection `/check-email`).
   - Ces composants acceptent une prop optionnelle `onSuccess`/`mode` pour se comporter aussi bien dans une page que dans un modal (ex. fermer le modal + router.refresh sur succès).
3. **Créer `apps/web/components/auth/auth-dialog.tsx`** : un `Dialog` qui affiche `LoginForm` ou `RegisterForm`, avec bascule entre les deux onglets (« Se connecter » / « Créer un compte »). État d'ouverture contrôlé par le composant appelant.
4. **Brancher les points d'entrée** :
   - `app-header.tsx` : les boutons Connexion / Inscription ouvrent `AuthDialog` au lieu de naviguer.
   - CTA de la landing (`page.tsx`) : idem.
5. **Conserver les pages** : `/login` et `/register` continuent de rendre `LoginForm` / `RegisterForm` dans `AuthSplitLayout` (fallback URL directe, SEO, refresh, liens externes).
6. **Ne pas toucher** aux pages e-mail : `verify-email`, `reset-password`, `forgot-password`, `check-email` restent des pages.

### États gérés (obligatoire — règle projet)
`LoginForm`/`RegisterForm` doivent couvrir : loading, error (dont 403 email non vérifié, lockout brute-force), success, empty (champs vides / validation). Le modal gère aussi la fermeture au succès et le focus trap (fourni par Radix Dialog).

### Tests / vérification
- Vérifier manuellement : ouverture modal depuis header et landing, bascule login↔register, succès ferme le modal, accès direct `/login` et `/register` toujours fonctionnel, liens e-mail toujours sur pages.

---

## Volet 3 — Réécriture minimaliste du texte

### Landing (`apps/web/app/page.tsx`)
Condenser ~10 sections en **5-6** :
1. **Hero** — titre court (1 ligne), sous-titre 1 phrase, 2 CTA.
2. **Comment ça marche** — 4 étapes, une phrase chacune (composant `how-it-works.tsx` conservé, textes raccourcis).
3. **Moyens de paiement** — showcase des PSP (`payment-providers-showcase.tsx`), sans paragraphe marketing long.
4. **Offres / pricing** — 2 cartes, descriptions ramenées à l'essentiel.
5. **FAQ courte** — 3-4 questions max, réponses 1 phrase.
6. **CTA final** — titre + 1 bouton.

Sections fusionnées / supprimées : « Operational Visibility », « Partner Growth Model », « Trust & Compliance » (3 sections de bullets redondantes) → condensées en une bande de 3 points courts ou intégrées au Hero/Comment ça marche. Testimonials : conservés seulement si utiles, sinon retirés (YAGNI marketing).

### Écrans applicatifs & asides auth
- `auth-marketing-aside.tsx` : réduire à 2-3 bullets courts.
- Alléger les textes d'aide/marketing verbeux sur les écrans app (dashboard, vote) sans toucher à la logique.

### Contraintes
- **Bilingue FR/EN conservé** via `useI18n()` — chaque texte raccourci l'est dans les deux langues.
- **Aucune logique modifiée** : uniquement copy + structure JSX.
- Respecter le design system existant (tokens `globals.css`, composants shadcn).

### Vérification
- Revue visuelle FR et EN, mobile + desktop. Vérifier qu'aucune clé i18n n'est orpheline.

---

## Ordre d'implémentation proposé

1. Volet 1 (auth) — correctifs B, C, D + ADR pour A + tests. Le plus sensible, à faire d'abord et à valider par les tests.
2. Volet 2 (modals) — extraction des formulaires puis AuthDialog puis branchement.
3. Volet 3 (texte) — réécriture, en dernier car cosmétique et sans risque logique.

## Risques & points d'attention

- **Extraction des formulaires** : risque de régression sur la logique existante (lockout, org-code, 403). Mitigation : extraire sans réécrire la logique, juste déplacer + paramétrer.
- **Politique mot de passe plus stricte** : ne s'applique qu'aux nouveaux mots de passe (register + reset) ; ne pas invalider les mots de passe existants au login.
- **i18n** : ne pas laisser de clés FR sans équivalent EN lors de la réécriture.

## Hors périmètre explicite

- Intégration SebPay (endpoints réels) — en attente de doc technique vérifiable.
- 2FA, purge tokens, throttle `/auth/me`.
- Refonte du système de paiement (déjà solide).
