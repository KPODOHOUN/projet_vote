# Spec — Notifications in-app (full-stack)

**Date:** 2026-06-22
**Sous-projet #4** du programme (Invitations ✅ → Compte ✅ → Recherche ✅ → **Notifications** → Design).
**Périmètre:** Backend (table + module + câblage de 4 déclencheurs + tests vraie DB) puis frontend (cloche header + page).

## Contexte & objectif

Notifier en in-app les membres d'une organisation lors d'événements métier clés, avec une cloche (compteur non-lus + panneau) et une page liste. Pas d'email (pas d'infra). Livraison quasi temps réel par **polling léger** (~30 s).

L'infra temps réel existante est du SSE par *polling* interne (suivi paiement). Pour les notifications, on reste sur un polling client simple (pas de connexion persistante). Les événements métier sont déjà audités (`payment`/`vote` succeeded, `invitation.accepted`, activation event, payout).

**Décisions de cadrage validées :**
- 4 déclencheurs : **paiement/vote réussi, invitation acceptée, événement activé, payout réussi/échoué**.
- Livraison : **polling** (la cloche interroge le compteur ~30 s ; le panneau charge la liste à l'ouverture).
- Destinataires : membres du tenant de rôle **≠ `ORGANIZER_STAFF`** (cohérent avec le gating recherche). Ajustable.
- Stockage **`type` + `data` structurée** (pas de texte) → libellé localisé fr/en rendu côté client.

## Contrats backend existants (vérifiés — sites de déclencheurs)

- Paiement → `SUCCEEDED` : `apps/api/src/payments/feexpay/feexpay-verify.service.ts` (~l.160, `tx.update status: SUCCEEDED`).
- Événement → `ACTIVE` : `apps/api/src/events/events.service.ts` (~l.210, transition `input.status === ACTIVE && event.status !== ACTIVE`).
- Invitation acceptée : `apps/api/src/auth/auth.service.ts` `acceptInvitation` (chemin succès, après création de l'utilisateur).
- Payout → `SUCCEEDED`/`FAILED` : `apps/api/src/payouts/payouts.service.ts` (~l.246-254 et ~l.319-340, `payout.update status: SUCCEEDED|FAILED`).
- `User` : `{ id, tenantId, role }`, `UserRole` (PLATFORM_SUPER_ADMIN/PLATFORM_ADMIN/ORGANIZER_OWNER/ORGANIZER_STAFF).
- `AuthGuard` + `@CurrentUser() user: AuthUser` (`{ userId, tenantId, role, email }`). Prisma : `this.prisma.client.<model>`.
- Tests vraie DB : `node:test`, `resetDatabase()` truncate la liste `TABLES` de `apps/api/src/test-utils/db.ts` — **il FAUT y ajouter `"Notification"`**.

## Architecture

### Migration + modèle
`schema.prisma` :
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
  userId    String           // destinataire
  type      NotificationType
  data      Json
  readAt    DateTime?
  createdAt DateTime         @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt])
}
```
+ back-relations `notifications Notification[]` sur `Tenant` et `User`. Migration SQL créant l'enum + la table + l'index. Appliquée à dev + `votezpro_test`. Ajouter `"Notification"` à `TABLES` dans `test-utils/db.ts`.

Forme de `data` par type :
| type | data |
|---|---|
| PAYMENT_SUCCEEDED | `{ eventId: string, amountCfa: number }` |
| INVITATION_ACCEPTED | `{ email: string }` |
| EVENT_ACTIVATED | `{ eventId: string, title: string }` |
| PAYOUT_SUCCEEDED / PAYOUT_FAILED | `{ payoutId: string, amountCfa: number }` |

### Modules `notifications` (scindés pour éviter un cycle)
**Risque de cycle** : `AuthModule` doit appeler `NotificationsService` (trigger acceptInvitation) ET le `NotificationsController` a besoin d'`AuthGuard` (exporté par `AuthModule`) → cycle si tout est dans un seul module. **Solution sans `forwardRef`** : scinder.
- **`NotificationsCoreModule`** : providers `[NotificationsService, PrismaService]`, **exports `[NotificationsService]`**, n'importe **rien d'autre** (surtout PAS `AuthModule`). Les modules déclencheurs (payments/events/auth/payouts) importent CE module.
- **`NotificationsModule`** : `controllers: [NotificationsController]`, `imports: [AuthModule, NotificationsCoreModule]` (le guard + le service). Enregistré dans `app.module.ts`.
- Ainsi : `AuthModule → NotificationsCoreModule` (pas de retour) et `NotificationsModule → AuthModule` (pas de retour) → aucun cycle.

`NotificationsService` (+ `NotificationsController`).

- `create(tenantId: string, type: NotificationType, data: Prisma.JsonObject): Promise<void>` — **best-effort, ne lève jamais** (try/catch interne + log). Résout les destinataires (`user.findMany({ where: { tenantId, role: { not: ORGANIZER_STAFF } }, select: { id } })`), puis `notification.createMany` (une ligne par destinataire). Si aucun destinataire → no-op. Appelée hors transaction métier (les sites de déclencheurs l'invoquent en *fire-and-forget* après le commit : `void this.notifications.create(...)`).
- `list(user, { limit, unreadOnly })` — `where { userId: user.userId, ...(unreadOnly ? { readAt: null } : {}) }`, `orderBy createdAt desc`, `take` borné `[1,50]` défaut 20. Renvoie `{ items: [{ id, type, data, readAt, createdAt }] }`.
- `unreadCount(user)` — `count({ where: { userId: user.userId, readAt: null } })` → `{ count }`.
- `markRead(user, id)` — `updateMany({ where: { id, userId: user.userId, readAt: null }, data: { readAt: now } })` ; si `count === 0` et la notif n'appartient pas au user → `NotFoundException` (vérifier l'appartenance via un findFirst scoping `{ id, userId }` → 404 si absent). Idempotent si déjà lue.
- `markAllRead(user)` — `updateMany({ where: { userId: user.userId, readAt: null }, data: { readAt: now } })` → `{ updated: count }`.

Endpoints (`@Controller("notifications")`, `AuthGuard`) :
| Méthode | Route | Réponse |
|---|---|---|
| GET | `/notifications?limit=&unreadOnly=` | `{ items: Notification[] }` |
| GET | `/notifications/unread-count` | `{ count: number }` |
| POST | `/notifications/:id/read` | `{ id, readAt }` |
| POST | `/notifications/read-all` | `{ updated: number }` |

### Câblage des déclencheurs
Les modules concernés importent `NotificationsModule` et appellent `notificationsService.create(...)` au bon endroit, en **fire-and-forget best-effort** (jamais dans le chemin critique de la transaction ; un échec n'affecte pas le métier) :
- `feexpay-verify.service.ts` : après la transition tx→SUCCEEDED → `PAYMENT_SUCCEEDED { eventId: tx.eventId, amountCfa: tx.amountCfa }` (tenantId = tx.tenantId).
- `events.service.ts` : après la transition event→ACTIVE → `EVENT_ACTIVATED { eventId, title }` (tenantId = event.tenantId).
- `auth.service.ts` `acceptInvitation` : après création de l'utilisateur → `INVITATION_ACCEPTED { email }` (tenantId = invitation.tenantId).
- `payouts.service.ts` : aux transitions payout→SUCCEEDED / →FAILED → `PAYOUT_SUCCEEDED|FAILED { payoutId, amountCfa }` (tenantId = payout.tenantId).

Chaque module déclencheur (payments, events, auth, payouts) ajoute **`NotificationsCoreModule`** à ses `imports` et injecte `NotificationsService`. `NotificationsCoreModule` n'importe pas `AuthModule` → pas de cycle (cf. section Modules ci-dessus).

### Tests backend (vraie DB `votezpro_test`)
- **Fan-out non-STAFF** : un tenant avec OWNER + STAFF + ADMIN ; `create(...)` insère une notif pour OWNER et ADMIN, **pas** pour STAFF.
- **Isolation** : `list`/`unreadCount` ne renvoient que les notifs du `userId` courant ; une notif d'un autre user/tenant n'apparaît pas.
- **unreadCount** : compte uniquement `readAt: null`.
- **markRead** : marque la sienne ; la notif d'un autre user → `NotFoundException` (pas d'IDOR). Idempotent si déjà lue.
- **markAllRead** : passe toutes les non-lues du user à lues, renvoie le compte.
- **best-effort** : `create` sur un tenant sans destinataire non-STAFF → no-op, ne lève pas.
- Ajouter `"Notification"` à `test-utils/db.ts` TABLES ; câbler `dist/notifications/notifications.service.test.js` dans les scripts `test` + `test:coverage`.

## Frontend

### Couche données `apps/web/lib/notifications.ts`
```ts
export type NotificationType = "PAYMENT_SUCCEEDED" | "INVITATION_ACCEPTED" | "EVENT_ACTIVATED" | "PAYOUT_SUCCEEDED" | "PAYOUT_FAILED";
export type AppNotification = { id: string; type: NotificationType; data: Record<string, unknown>; readAt: string | null; createdAt: string };
listNotifications(token, opts?: { limit?: number; unreadOnly?: boolean }): Promise<{ items: AppNotification[] }>
unreadCount(token): Promise<{ count: number }>
markRead(token, id): Promise<{ id: string; readAt: string }>
markAllRead(token): Promise<{ updated: number }>
```
+ `notificationText(n, t, isEn): string` — compose un libellé localisé depuis `n.type` + `n.data` (fragments `t("notif.*")` + valeurs). + `notificationHref(n): string` — paiement/payout → `/dashboard/payments` ; invitation → `/dashboard/team` ; événement → `/dashboard/events/${data.eventId}/candidates`.

### A. Cloche dans le header (`components/dashboard-header.tsx`)
- Bouton `Bell` (à gauche du libellé compte) avec **badge non-lus** (masqué si 0). `aria-label` incluant le compte.
- **Polling** : `setInterval` ~30 s appelant `unreadCount` (nettoyé au démontage ; en plus d'un fetch initial).
- Clic → dropdown : `listNotifications({ limit: 10 })`, chaque item = bouton (texte `notificationText` + date relative), non-lus visuellement distincts ; bouton **« Tout marquer comme lu »** (`markAllRead` → recharge le compteur) ; clic item → `markRead(id)` puis navigation `notificationHref`. Pied « Voir tout → » → `/dashboard/notifications`.
- États : loading, vide (`EmptyState` court), erreur. Fermeture Échap / clic extérieur. A11y honnête (boutons natifs, pas de faux rôles ARIA).
- Coexiste avec la palette de recherche (gauche) et compte/logout (droite).

### B. Page `/dashboard/notifications` (`app/dashboard/notifications/page.tsx`, client)
- Au montage : `listNotifications({ limit: 50 })`. Bouton « Tout marquer comme lu ». Liste `vp-event-rows` ; clic item → `markRead` + navigue. États : loading `LoadingState`, vide `EmptyState`, erreur `vp-error`.

### Intégration
- Entrée sidebar « Notifications » (icône `Bell`) après « Compte ».
- Clés i18n `notif.*` (fr/en) : un fragment de titre par type + libellés panneau (« Tout marquer comme lu », « Voir tout », vide, etc.). Aucune string métier en dur.

### États & a11y
- Tous états couverts ; WCAG AA (labels, focus, badge annoncé, contraste) ; pas de faux contrat ARIA (boutons natifs).

### Tests e2e Playwright (`apps/web/tests/e2e/notifications.spec.ts`)
- OWNER seedé invite un membre → l'invité·e accepte via le lien (déclenche `INVITATION_ACCEPTED` pour l'OWNER) → revenir en OWNER → la cloche affiche un badge non-lu → ouverture du panneau → l'item invitation est présent. (Bout-en-bout via un vrai déclencheur, en réutilisant le flux d'`invitations.spec.ts`.)
- Respecter les gotchas e2e (`E2E_API_BASE_URL=:3011`, headless-shell).

## Sécurité & robustesse
- Notifications **scopées à l'utilisateur** (`userId`) ; `markRead` vérifie l'appartenance (pas d'IDOR cross-user). `list`/`unreadCount` ne fuient jamais les notifs d'autrui.
- `create` **best-effort** : try/catch interne, fire-and-forget aux sites de déclencheurs → un échec de notification ne casse jamais un paiement, une activation, une acceptation d'invitation ou un payout.
- Fan-out borné aux membres non-STAFF du tenant ; pas d'exposition cross-tenant.
- `data` est de la donnée structurée non sensible (ids, montants, email d'un membre invité) — pas de téléphone votant, pas de secret.

## Hors périmètre (YAGNI / plus tard)
- Email / push mobile (pas d'infra email).
- Flux SSE temps réel (le polling suffit ; l'endpoint reste compatible d'un ajout SSE ultérieur).
- Préférences de notification par utilisateur (opt-in/opt-out par type).
- Notifications destinées au votant public (hors dashboard organisateur).
- Regroupement/agrégation (« 5 votes reçus ») — une notif par événement au MVP.

## Critères de succès
- Lors d'un paiement réussi / invitation acceptée / event activé / payout, les membres non-STAFF du tenant reçoivent une notification ; la cloche affiche le compteur non-lus (polling ~30 s) ; le panneau et la page listent les notifs localisées, cliquables, marquables lues.
- Un échec d'insertion de notification n'interrompt jamais l'action métier.
- Aucune fuite cross-user/cross-tenant ; STAFF ne reçoit pas les notifs.
- Tous états UX ; WCAG AA ; tests backend vraie DB verts (fan-out/isolation/IDOR/best-effort) ; typecheck + lint + build prod verts ; e2e vert.
