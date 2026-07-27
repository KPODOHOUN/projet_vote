# Spec — Réglages compte (full-stack)

**Date:** 2026-06-21
**Sous-projet #2** du programme (séquence : Invitations ✅ → **Compte** → Recherche → Notifications → Design).
**Périmètre:** Backend NestJS + migration Prisma + tests vraie DB, puis frontend.

## Contexte & objectif

Donner à un membre connecté une page de réglages de son compte : voir ses infos, changer son mot de passe, changer son email, et gérer ses sessions actives (lister + révoquer, « déconnecter partout ailleurs »).

Le modèle `User` ne contient que `email`, `passwordHash`, `role`, `tenantId`, `createdAt`, `updatedAt` (pas de nom/avatar). `AuthSession` ne stocke aujourd'hui ni appareil ni IP. Aucun endpoint de gestion de compte n'existe (seulement register/login/refresh/logout/accept-invitation + `GET /me`).

**Décisions de cadrage validées :**
- Sessions enrichies d'**appareil + IP** (migration + capture au login/refresh/accept).
- Changement de mot de passe **et** d'email → **révocation de toutes les autres sessions** (la courante est conservée).
- Changement d'email **immédiat, protégé par le mot de passe actuel, sans email de vérification** (pas d'infra email dans le projet).

## Contrats backend existants (vérifiés — à réutiliser, pas réécrire)

- `User` : `@@unique([tenantId, email])`. Hash : `bcryptjs` `hash(pwd, 12)` / `compare(pwd, hash)`.
- `AuthSession` : `id, tenantId, userId, refreshTokenHash, expiresAt, revokedAt, rotatedFromSessionId, createdAt, updatedAt`. Index `[userId, revokedAt]`.
- `AuthService.createSession(user, rotatedFromSessionId?)` → `{ refreshToken }`, stocke `refreshTokenHash = sha256(refreshToken)`.
- `AuthService.hashToken(raw)` = `createHash("sha256").update(raw).digest("hex")` (privé aujourd'hui).
- `AuthService.signAccessToken(user)` → JWT HS256 avec `{ tenantId, role, email }`, sub=userId (privé aujourd'hui).
- Cookie refresh : `vp_refresh` (HttpOnly), lu via `request.cookies["vp_refresh"]`. La **session courante** = celle dont `refreshTokenHash === sha256(vp_refresh)`.
- `AuthGuard` + `@CurrentUser() user: AuthUser` (`{ userId, tenantId, role, email }`). `AuthModule` exporte `AuthService` + `AuthGuard`.
- `Tenant` : `{ slug (unique), displayName }`.
- Throttler global présent (`@Throttle({ default: { ttl, limit } })`).

## Architecture

Nouveau module `account` (un module par domaine, comme `invitations`/`payouts`). Il importe `AuthModule` et réutilise les primitives de session/token. On **expose deux helpers publics** sur `AuthService` pour éviter la duplication :
- `issueAccessToken(user: AuthUser): Promise<string>` (wrappe `signAccessToken`).
- `hashRefreshToken(raw: string): string` (wrappe `hashToken`).

### Migration
`packages/db/prisma/migrations/<ts>_add_session_device_metadata/migration.sql` :
```sql
ALTER TABLE "AuthSession" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "ipAddress" TEXT;
```
+ champs `userAgent String?` / `ipAddress String?` dans `schema.prisma` (modèle `AuthSession`). Appliquer à dev + test (`votezpro_test`) ; à déployer staging/prod ensuite.

### Capture appareil/IP
- `AuthService.createSession` accepte un 2e/3e argument optionnel `meta?: { userAgent?: string | null; ipAddress?: string | null }` et le persiste.
- Les méthodes `register` / `login` / `refresh` / `acceptInvitation` acceptent et propagent `meta`.
- Les contrôleurs extraient `meta` de la requête : `userAgent = request.headers["user-agent"] ?? null` ; `ipAddress = (request.headers["x-forwarded-for"]?.split(",")[0].trim()) ?? request.ip ?? null` (X-Forwarded-For leftmost derrière Cloud Run).
- Régression à éviter : signatures rétro-compatibles (`meta` optionnel) ; les sessions existantes ont `userAgent/ipAddress = NULL` (affichées « Appareil inconnu »).

### Endpoints (`AccountController`, préfixe `/account`, `AuthGuard`)

| Méthode | Route | Corps | Réponse | Effet |
|---|---|---|---|---|
| GET | `/account` | — | `{ email, role, tenant: { displayName, slug }, createdAt }` | Lecture infos (user.createdAt + tenant). |
| POST | `/account/password` (throttle 5/60s) | `{ currentPassword, newPassword }` (zod : new 8–72) | `{ success: true }` | `compare(current)` → sinon `401`. `hash(new,12)`, update user, **révoque toutes les sessions du user sauf la courante**. |
| POST | `/account/email` (throttle 5/60s) | `{ newEmail (email), currentPassword }` | `{ accessToken }` (+ cookie inchangé) | `compare(current)` → sinon `401`. Email normalisé lowercase ; si déjà pris dans le tenant → `409`. Update email. `issueAccessToken({…, email:new})`. Révoque les autres sessions. |
| GET | `/account/sessions` | — | `{ items: Array<{ id, userAgent, ipAddress, createdAt, expiresAt, current }> }` | Sessions du user non révoquées et non expirées, `current` = match `sha256(vp_refresh)`. Triées `createdAt desc`. |
| POST | `/account/sessions/revoke-others` | — | `{ revoked: number }` | `revokedAt = now()` sur toutes les sessions actives du user sauf la courante. |
| DELETE | `/account/sessions/:id` | — | `{ id, revoked: true }` | La session doit appartenir au user (`404` sinon). Révoque (`revokedAt`). Révoquer la courante est autorisé (= déconnexion de cet appareil). |

Notes :
- Endpoints nécessitant la session courante (`password`, `email`, `sessions`, `revoke-others`) lisent le cookie `vp_refresh` dans le contrôleur et passent `currentRefreshToken` (ou son hash) au service.
- `/account/email` ne tourne PAS le cookie refresh (la session reste valide ; seul le JWT, qui porte l'email, est réémis). Le front remplace l'access token stocké.
- Audit : journaliser `account.password.changed`, `account.email.changed`, `account.session.revoked` dans `AuditLog` (pattern existant des autres services).

### Tests backend (vraie DB `votezpro_test`, pattern du repo)
- `account.service.test.ts` :
  - password : mauvais `currentPassword` → 401 ; succès → hash changé + `compare(new)` ok + autres sessions révoquées, courante intacte.
  - email : mauvais mdp → 401 ; email déjà membre → 409 ; succès → email mis à jour + accessToken réémis contient le nouvel email + autres sessions révoquées.
  - sessions : list ne renvoie que les actives du user, `current` correctement marqué ; `revoke-others` ne touche pas la courante ; `DELETE /:id` d'une session d'un autre user → 404.
- Ajouter `AuthSession` à `db.ts` TABLES si nécessaire (les nouvelles colonnes sont sur une table déjà suivie).

## Frontend

### Couche données `apps/web/lib/account.ts`
Types `Account`, `Session` + fonctions (toutes avec `Authorization: Bearer` sauf rien de public ici) :
```ts
type Account = { email: string; role: string; tenant: { displayName: string; slug: string }; createdAt: string };
type Session = { id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; expiresAt: string; current: boolean };
getAccount(token): Promise<Account>
changePassword(token, { currentPassword, newPassword }): Promise<{ success: true }>
changeEmail(token, { newEmail, currentPassword }): Promise<{ accessToken: string }>
listSessions(token): Promise<{ items: Session[] }>
revokeOtherSessions(token): Promise<{ revoked: number }>
revokeSession(token, id): Promise<{ id: string; revoked: true }>
```
+ helper présentation `deviceLabel(userAgent: string | null): string` (extraction navigateur + OS heuristique depuis l'UA ; fallback « Appareil inconnu » / « Unknown device »).

### Page `apps/web/app/dashboard/account/page.tsx` (client, couche dashboard `vp-*` + primitives)
4 sections **indépendantes** (chacune son état loading/error/success) :
1. **Infos compte** (lecture) : email, rôle (`StatusChip`), organisation (`displayName` + `@slug`), « membre depuis » (`createdAt`). Bloc lecture seule.
2. **Changer le mot de passe** : `Input` actuel / nouveau / confirmation, toggle afficher/masquer (pattern login), validation inline (min 8 + correspondance), `Button loading`. Succès → message + reset + mention « vos autres sessions ont été déconnectées ».
3. **Changer l'email** : `Input` nouvel email + mot de passe actuel. Succès → `setStoredToken(accessToken)` + message. Erreurs : 401 (mdp), 409 (email pris), fallback.
4. **Sessions actives** : liste `vp-event-rows` : `deviceLabel(userAgent)` · IP · créée/expire, badge **« Session actuelle »** (`StatusChip tone="active"`) sur la courante. Bouton **Révoquer** par ligne (`ConfirmDialog`, masqué/désactivé sur la courante) + bouton **« Déconnecter les autres sessions »** (`ConfirmDialog` → `revokeOtherSessions`). Après révocation → rechargement de la liste.

### Intégration
- Entrée sidebar « Compte / Account » (icône `CircleUser` de lucide), après « Équipe ».
- Clés i18n `account.*` (fr + en, dans les deux blocs de `lib/i18n.ts`), `nav.account`. Zéro string métier en dur (sauf le pattern eyebrow `isEn ?` toléré comme ailleurs).

### États & a11y
- Tous états couverts ; WCAG AA : labels visibles, erreurs annoncées (`role="alert"` / `FormError`), toggles mdp avec `aria-label`, focus visibles, touch ≥44px, `ConfirmDialog` (Radix) pour les révocations.

### Tests e2e Playwright (`apps/web/tests/e2e/account.spec.ts`)
- Login OWNER seedé → `/dashboard/account`.
- Infos compte affiche l'email seedé.
- Changer le mot de passe (current correct → succès) ; mauvais current → message d'erreur.
- Sessions : au moins une session, marquée « actuelle ».
- (Si faisable dans le harnais) changer l'email puis re-login avec le nouvel email.
- Respecter les gotchas e2e (`E2E_API_BASE_URL=:3011`, headless-shell).

## Sécurité
- Endpoints password/email throttlés ; toujours derrière `AuthGuard` (scope au user courant via `@CurrentUser`).
- Révocation des autres sessions sur changement mdp/email (limite l'impact d'un vol de session).
- `GET /account/sessions` ne renvoie que les sessions du user courant ; `DELETE /:id` vérifie l'appartenance (404 sinon) — pas d'IDOR cross-user.
- L'email est normalisé lowercase et l'unicité `@@unique([tenantId,email])` est vérifiée avant update (409 sinon) — pas de collision silencieuse.
- IP/UA sont des données personnelles : stockées pour la sécurité du compte ; pas d'exposition cross-user.

## Hors périmètre (YAGNI / plus tard)
- Vérification d'email par lien (pas d'infra email).
- Nom d'affichage / avatar (pas de colonnes ; hors scope).
- 2FA / TOTP.
- Géolocalisation IP (on affiche l'IP brute, pas de lookup pays/ville).
- Notifications de connexion suspecte (relève du sous-projet Notifications).

## Critères de succès
- Un membre voit ses infos, change son mot de passe et son email (protégé par mdp), et gère ses sessions (liste avec appareil/IP, session courante marquée, révocation unitaire + « déconnecter les autres »).
- Changement mdp/email révoque bien les autres sessions ; la courante reste active.
- Tous états UX couverts ; WCAG AA ; tests backend vraie DB verts ; typecheck + lint + build prod verts ; e2e verts.
