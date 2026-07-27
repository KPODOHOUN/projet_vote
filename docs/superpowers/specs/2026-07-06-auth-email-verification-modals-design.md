# Vérification email (première inscription) + Auth en modals — Design

**Date :** 2026-07-06
**Chantiers :** B (vérification email) + C (auth en modals). Le durcissement du token (finding #1 de l'audit — access token en `localStorage`) est **hors périmètre**, reporté à un chantier de durcissement dédié.

## 1. Contexte & objectifs

Aujourd'hui `POST /auth/register` crée le tenant + l'utilisateur ORGANIZER_OWNER et émet immédiatement une session, **sans prouver la possession de l'email** (finding #4 de l'audit auth). Par ailleurs les écrans `/login` et `/register` sont deux pages plein écran de ~300 lignes chacune, ce qui alourdit le travail front.

Objectifs :
1. **Prouver l'email à la première inscription** via un lien de confirmation, une seule fois (pas de gate permanent sur les actions, pas de re-vérification ultérieure).
2. **Unifier login + register + état "vérifiez votre mail" dans un seul composant modal**, ouvrable depuis n'importe où, pour réduire la surface front à maintenir.

### Non-objectifs
- Pas de gating par action (créer/activer un événement, inviter) sur le statut de vérification. La vérification ne bloque **que** la première entrée.
- Pas de sortie du token hors `localStorage` (chantier séparé).
- Pas de changement au flux d'invitation de membres (`/auth/accept-invitation`) : un invité est déjà réputé prouvé par le lien d'invitation signé — son compte est créé `emailVerifiedAt = now()`.

## 2. Modèle de données (Prisma)

```prisma
model User {
  // …existant…
  emailVerifiedAt DateTime?   // null = email non vérifié
}

model EmailVerificationToken {
  id         String   @id @default(cuid())
  tokenHash  String   @unique          // SHA-256 du token brut, jamais le brut
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime                  // now + 24h
  usedAt     DateTime?                 // single-use
  createdAt  DateTime @default(now())

  @@index([userId])
}
```

Réutilise le patron éprouvé de `Invitation` (token hashé SHA-256, expiration, single-use).

### Migration
- Ajout des colonnes/table ci-dessus.
- **Backfill** : `UPDATE "User" SET "emailVerifiedAt" = now() WHERE "emailVerifiedAt" IS NULL;` — tous les comptes existants (seed, testeurs déjà inscrits, invités) sont marqués vérifiés pour ne bloquer personne rétroactivement.
- Ajouter `EmailVerificationToken` à la liste `TABLES` de `apps/api/test/db.ts` (règle real-DB tests).

## 3. Backend (NestJS — `auth.service.ts` / `auth.controller.ts`)

### 3.1 `register` (modifié)
- Crée tenant + user avec `emailVerifiedAt = null`.
- **N'émet plus** de session (ni accessToken, ni cookie refresh).
- Génère un token de vérification (`randomBytes(32).hex`), stocke son hash, envoie l'email via `MailService.send` (lien `${APP_PUBLIC_URL}/auth/verify?token=<brut>`).
- Réponse : `{ status: "verification_sent", email }` (jamais le token).
- En dev (sans `MAIL_RESEND_API_KEY`), `MailService` logge déjà ; on logge **en plus** l'URL de vérification complète (niveau `warn`) pour tester en local.

### 3.2 `POST /auth/verify` (nouveau)
Body : `{ token: string }`.
- Hash → lookup `EmailVerificationToken`.
- Rejets : token inconnu / `usedAt != null` / `expiresAt` dépassé → 400 « Lien invalide ou expiré » (+ chemin renvoi).
- Sinon : transaction → `usedAt = now()`, `user.emailVerifiedAt = now()`, puis **émet accessToken + cookie refresh** (login effectif). Réponse `{ accessToken }`.
- Idempotence douce : si le user est déjà vérifié et le token déjà utilisé, renvoyer 400 explicite (pas de session).

### 3.3 `POST /auth/resend-verification` (nouveau)
Body : `{ email, tenantSlug? }`. Throttle strict (`{ ttl: 60_000, limit: 3 }`).
- Résout le user (même logique que login). Si introuvable **ou déjà vérifié** → réponse **neutre** `{ status: "sent" }` (anti-énumération). Sinon invalide les anciens tokens du user, en crée un neuf, renvoie l'email.

### 3.4 `login` (modifié)
- Après validation du mot de passe : si `user.emailVerifiedAt == null` → **403** `{ code: "EMAIL_NOT_VERIFIED" }`, message « Vérifiez votre email pour activer votre compte ». Ne compte pas comme échec de mot de passe (pas d'incrément lockout).
- Sinon inchangé.

### 3.5 Throttling (controller)
`verify` : `{ ttl: 60_000, limit: 10 }` ; `resend-verification` : `{ ttl: 60_000, limit: 3 }`.

## 4. Frontend (Next.js / apps/web)

### 4.1 `<AuthModal>` (nouveau, chantier C)
- Basé sur le `Dialog` du design system (primitives shadcn, couche "app").
- Machine à états internes : `view ∈ { login, register, check-email }`.
  - `login` : email + mot de passe + `<details>` code d'organisation (reprend la logique existante `login/page.tsx`). Gère l'erreur `EMAIL_NOT_VERIFIED` (403) → propose « Renvoyer le lien » (appelle `/auth/resend-verification`).
  - `register` : nom d'orga + email + mot de passe + case RGPD (logique existante `register/page.tsx`). Sur succès → bascule vers `check-email`.
  - `check-email` : « 📧 Un lien a été envoyé à <email> » + bouton « Renvoyer » (throttlé côté UI).
- Ouvrable via un contexte léger `useAuthModal()` (ouvrir/fermer + vue initiale) branché sur le header et les CTA publics.

### 4.2 Routes existantes
- `/login` et `/register` sont **conservées** (deep-link, SEO, liens emails) mais rendent `<AuthModal>` en présentation plein écran avec la bonne `view` initiale. → **une seule logique** de formulaire, plus deux pages de 300 lignes divergentes. Les fichiers `login/page.tsx` et `register/page.tsx` sont réduits à un wrapper.

### 4.3 Page `/auth/verify` (nouveau, Client Component)
- Lit `?token=` , appelle `POST /auth/verify`.
- États : `verifying` (spinner) / `success` (→ `setStoredToken`, redirect `/dashboard`) / `error` (lien invalide/expiré → bouton « Renvoyer un lien » ouvrant l'AuthModal en vue login+resend).

### 4.4 `lib/auth` / `lib/api`
- Inchangé (le token continue d'aller en `localStorage` — durcissement reporté). `/auth/verify` et `/auth/register` réutilisent `apiFetch`.

## 5. Emails (`MailService`, existant — Resend)
- Template texte + HTML minimal, cohérent avec l'email d'invitation existant. Sujet : « Confirmez votre adresse — SHADOMA Votes ». CTA = lien de vérification (expire 24h).
- **Prérequis déploiement (bloquant)** : `MAIL_RESEND_API_KEY` et `MAIL_FROM` doivent être configurés sur Render (absents de `render.yaml` aujourd'hui). Sans eux, aucun email de vérification ne partira aux testeurs → signup bloqué. À ajouter au blueprint / dashboard Render **avant** de déployer ce chantier.

## 6. Gestion d'erreurs (synthèse)
| Cas | Réponse |
|-----|---------|
| register email déjà utilisé sur un tenant existant | 409 (inchangé) |
| verify token inconnu/expiré/utilisé | 400 « Lien invalide ou expiré » |
| login compte non vérifié | 403 `EMAIL_NOT_VERIFIED` + renvoi |
| resend user introuvable/déjà vérifié | 200 neutre (anti-énumération) |
| dev sans Resend | lien loggué (warn), flux complet testable |

## 7. Tests (real DB, pas de mock)
- **API** : register ne crée pas de session + envoie un token ; verify (succès, token expiré, réutilisé, inconnu) ; login bloqué si non vérifié puis OK après verify ; resend neutre si déjà vérifié ; backfill = comptes existants connectables.
- **E2E web (Playwright)** : parcours register → check-email → (lire l'URL logguée en dev) → /auth/verify → dashboard ; login d'un compte non vérifié → message + renvoi. (Rappel gotcha : `E2E_API_BASE_URL=:3011`.)

## 8. Découpage d'implémentation (ordre)
1. Migration Prisma + backfill + `TABLES` de test.
2. Backend : register modifié, verify, resend, login bloquant + tests API.
3. Email template.
4. Front : `<AuthModal>` + contexte, réduction de `login/page.tsx` & `register/page.tsx` en wrappers.
5. Page `/auth/verify`.
6. E2E + doc (mettre à jour `GUIDE_TESTEURS.md` : préciser l'étape de confirmation email).
7. Prérequis déploiement : documenter `MAIL_RESEND_API_KEY`/`MAIL_FROM` dans `render.yaml`.

## 9. Risques
- **Resend non configuré en prod** → signup testeurs bloqué (cf §5). Mitigation : prérequis explicite + fallback « renvoyer ».
- **Cold start Render (15s timeout front)** : la page `/auth/verify` et le register peuvent timeouter si l'API est froide (cf mémoire test-accounts-and-auth-gotchas). Indépendant de ce chantier mais aggravé par un aller-retour email supplémentaire → renforce la reco keep-alive.
- Token de vérification dans l'URL loggué en dev seulement (jamais en prod).
