# Spec — Invitations (frontend)

**Date:** 2026-06-21
**Sous-projet #1** du programme « 4 features + passe design » (séquence validée : Invitations → Compte → Recherche → Notifications → Design).
**Périmètre:** Frontend uniquement. Le backend existe déjà et n'est pas modifié.

## Contexte & objectif

Permettre à un organisateur (OWNER) d'inviter des membres dans son organisation, de suivre l'état des invitations et de les révoquer ; et permettre à un·e invité·e de rejoindre l'organisation en définissant un mot de passe.

Le backend est livré (`apps/api/src/invitations/` + `AuthService.acceptInvitation`). Aucune UI n'existe encore. Le bouton « Inviter un utilisateur » de `dashboard/admin/users` a été retiré (non câblé) lors de la finalisation design ; il sera re-pointé vers la nouvelle page.

**Décision de cadrage (validée):** livraison du lien d'invitation **par copier-coller** (le backend ne fait pas d'email — il renvoie le token brut une seule fois, à transmettre « out-of-band »). Pas d'extension email dans ce sous-projet.

## Contrats backend (réels, vérifiés — ne pas modifier)

### `POST /organizer/invitations` — créer
- Auth: `AuthGuard` + `RolesGuard`. Rôles: `ORGANIZER_OWNER`, `PLATFORM_ADMIN`.
- Body (validé par zod côté API): `{ email: string (email), role: "ORGANIZER_OWNER" | "ORGANIZER_STAFF" }`.
- Réponse `201`: `{ id: string, email: string, role: string, token: string, expiresAt: string (ISO) }`.
- **`token` n'est renvoyé qu'à la création** (jamais relisible ensuite). TTL invitation = 48h.
- Erreurs: `409` si l'email est déjà membre. Re-inviter le même email révoque l'invitation PENDING précédente (côté backend, transparent).

### `GET /organizer/invitations` — lister
- Rôles: `ORGANIZER_OWNER`, `ORGANIZER_STAFF`, `PLATFORM_ADMIN`.
- Réponse `200`: `{ items: Array<{ id, email, role, status, expiresAt, acceptedAt, createdAt }> }`, triées `createdAt desc`.
- `status` ∈ `PENDING | ACCEPTED | REVOKED | EXPIRED` (enum `InvitationStatus`). `acceptedAt` est `string | null`.

### `DELETE /organizer/invitations/:invitationId` — révoquer
- Rôles: `ORGANIZER_OWNER`, `PLATFORM_ADMIN`.
- Réponse `200`: `{ id, status: "REVOKED" }`.
- Erreurs: `404` introuvable ; `400` si l'invitation n'est pas `PENDING` (seules les PENDING sont révocables).

### `POST /auth/accept-invitation` — accepter (public)
- Public, throttle `5 req / 60 s`.
- Body: `{ token: string (min 32), password: string (8–72) }`.
- Effet: crée l'utilisateur (email + rôle + tenant proviennent de l'invitation), pose le cookie HttpOnly `refreshToken`, renvoie `{ accessToken: string }`.
- Erreurs: `401` invitation invalide/expirée (l'API marque EXPIRED au passage) ; `409` déjà membre ; `429` throttle.
- **Pas de champ nom**, pas d'endpoint de prévisualisation du token (l'org/email ne sont pas connus du client avant acceptation).

## Architecture (unités)

### A. `apps/web/lib/invitations.ts` (couche données)
Surface typée stable au-dessus de `apiFetch`. Aucune string en dur métier ; pas de logique UI.

```ts
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export type InvitationRole = "ORGANIZER_OWNER" | "ORGANIZER_STAFF";

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type CreatedInvitation = {
  id: string; email: string; role: string; token: string; expiresAt: string;
};

listInvitations(token): Promise<{ items: Invitation[] }>
createInvitation(token, { email, role }): Promise<CreatedInvitation>
revokeInvitation(token, id): Promise<{ id: string; status: "REVOKED" }>
acceptInvitation({ token, password }): Promise<{ accessToken: string }>
```
- Les 3 premières passent `Authorization: Bearer <token>`. `acceptInvitation` est publique (pas d'auth header) et s'appuie sur le cookie posé par le serveur.
- Construction du lien d'acceptation: `buildAcceptUrl(token)` → `${origin}/accept-invitation/${token}`.

### B. `apps/web/app/dashboard/team/page.tsx` (page gestion, client component)
Couche dashboard = scaffolding `vp-*` + primitives `@/components/ui` (cohérent avec `admin/subscriptions`).

- Au montage: `GET /auth/me` (pour connaître le rôle) puis `listInvitations`. Redirige `/login` si pas de token.
- **Rôle**: OWNER/PLATFORM_ADMIN voient le formulaire de création + boutons révoquer. STAFF voit la liste seule (formulaire et actions masqués).
- **Formulaire création** (`vp-form`): `Input` email (type=email, validation inline au blur) + `<select>` rôle natif stylé par `.vp-form select` (OWNER/STAFF) avec helper text décrivant chaque rôle. `Button loading` au submit.
- **Panneau lien à usage unique** (après succès création): bloc d'avertissement (`role="status"`) « ce lien ne sera affiché qu'une seule fois », champ lecture seule sélectionnable contenant `buildAcceptUrl(token)`, **bouton Copier** (`navigator.clipboard.writeText`) avec feedback de succès (label « Copié ✓ » temporisé) + fallback si clipboard indisponible (sélection auto du texte). Le panneau reste jusqu'à fermeture explicite ou nouvelle création.
- **Liste** `vp-event-rows`: par invitation → `StatusChip` (mapping ci-dessous) + email (`<strong>`) + rôle + date d'expiration/acceptation. Sur `PENDING` (et si rôle le permet): bouton **Révoquer** ouvrant `ConfirmDialog` → `revokeInvitation` → rechargement de la liste.
- **États**: loading `LoadingState variant="rows"` ; empty `EmptyState` (titre + description + le formulaire reste la CTA) ; error `vp-error role=alert` (lit la vraie erreur API) ; success.

Mapping statut → ton `StatusChip`:
| status | tone |
|---|---|
| PENDING | `pending` |
| ACCEPTED | `success` |
| REVOKED | `muted` |
| EXPIRED | `error` |

### C. `apps/web/app/accept-invitation/[token]/page.tsx` (public, couche vp-*)
Calquée sur `app/login/page.tsx` (mêmes shells `vp-auth-*`). Client component lisant `params.token`.

- Texte honnête: « Vous avez été invité·e à rejoindre une organisation. Définissez un mot de passe pour activer votre accès. » (pas de fake org/email — non disponibles côté client).
- Champs: `Input` mot de passe (toggle afficher/masquer comme login) + `Input` confirmation. Validation inline: min 8 ; les deux doivent correspondre ; erreurs annoncées (`role="alert"`, `aria-live`).
- Submit → `acceptInvitation({ token, password })` → `setStoredToken(accessToken)` → `router.push("/dashboard")`.
- Erreurs (message humain + récupération):
  - `401` → « Invitation invalide ou expirée. » + lien vers `/login`.
  - `409` → « Vous êtes déjà membre. » + lien vers `/login`.
  - `429` → « Trop de tentatives, réessayez dans un instant. »
  - autre → message générique de repli.
- `generateMetadata`/SEO: `robots: noindex` (page transactionnelle privée).

### D. Intégration
- `dashboard/admin/users/page.tsx`: ajouter un `Button`/lien « Inviter un membre » → `Link href="/dashboard/team"` (re-câble le bouton retiré).
- `components/dashboard-sidebar.tsx`: nouvel item nav `{ href: "/dashboard/team", label: t("nav.team"), icon: UserPlus }` (placé après « Utilisateurs »). État actif déjà géré par le composant.
- `lib/i18n.ts`: clés `nav.team`, `invitations.*` (titres, labels champs, rôles, helper texts, statuts, messages d'erreur, libellés copier/révoquer), FR + EN. Aucune string en dur dans les composants.

## États & sécurité
- Aucune fake data ; toutes les données via `apiFetch`/les contrats ci-dessus.
- Le token d'acceptation est un secret porteur: affiché une seule fois, jamais persisté côté client au-delà du panneau, transmis en clair dans l'URL d'acceptation (inhérent au flux ; le backend le hash en SHA-256 et impose TTL 48h + usage unique).
- Le throttle d'acceptation (429) est géré côté UI ; le RolesGuard backend reste l'autorité (le masquage STAFF est UX, pas une garantie de sécurité — l'API refusera de toute façon création/révocation pour un STAFF).

## Tests (Playwright e2e, `apps/web/tests/e2e/`)
- `invitations.spec.ts`:
  1. OWNER seedé se connecte → `/dashboard/team` → crée une invitation (email+role) → le panneau lien à usage unique s'affiche avec une URL `/accept-invitation/<token>` → l'invitation apparaît PENDING dans la liste → révoque → passe REVOKED.
  2. Parcours acceptation: visite `/accept-invitation/<token>` (token capturé à l'étape 1) → définit un mot de passe → atterrit sur `/dashboard`.
  3. Cas erreur: `/accept-invitation/<token-bidon>` → message « invalide ou expirée ».
- Respecter les gotchas e2e existants (`E2E_API_BASE_URL=:3011`, browsers headless-shell).

## Hors périmètre (YAGNI / sous-projets ultérieurs)
- Envoi d'email automatique (resté en option d'un futur sous-projet).
- Endpoint de prévisualisation d'invitation (afficher org/email avant acceptation).
- Renvoi/extension de TTL d'une invitation depuis l'UI (re-créer suffit, le backend révoque l'ancienne).
- Gestion fine des membres existants (désactivation/changement de rôle d'un user déjà membre) — relève du sous-projet « Réglages compte » / admin.

## Critères de succès
- OWNER peut inviter, voir le lien une fois, copier, suivre les statuts, révoquer.
- STAFF voit la liste sans pouvoir créer/révoquer.
- Un·e invité·e rejoint l'org via le lien en définissant un mot de passe et atterrit authentifié sur le dashboard.
- Tous les états UX couverts ; WCAG AA (labels, focus, erreurs annoncées, contraste) ; typecheck + lint + build prod verts ; e2e verts.
