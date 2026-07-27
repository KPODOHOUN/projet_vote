# SHADOMA Votes — Parcours utilisateur (tous rôles)

> Scénario de référence, **fidèle au code réel** (endpoints, payloads, transitions d'état, garde-fous de sécurité).
> Exemple fil rouge : le concours **« Miss Campus Bénin 2026 »**, organisé par l'association *Campus Africa*.
> Préfixe API : `/api/v1`. Routes web = `apps/web`. Endpoints = `apps/api`.
> Dernière mise à jour : 2026-05-31.
>
> ⚠️ **Évolution en cours (ADR-016)** : l'événement devient l'unité « plateforme » publique, accessible par slug global via `GET /api/v1/votes/public/event/{eventSlug}` (front `/e/{eventSlug}` à venir). Ce document décrit encore le routage par organisateur (`/vote/{tenantSlug}/…`, toujours fonctionnel) ; il sera mis à jour quand la page web event-centrée atterrira.

## Légende des rôles

| Symbole | Rôle | Rôle technique (`UserRole`) |
|---------|------|------------------------------|
| 🟥 | Admin plateforme | `PLATFORM_ADMIN` |
| 🟩 | Organisateur (propriétaire) | `ORGANIZER_OWNER` |
| 🟩 | Organisateur (collaborateur) | `ORGANIZER_STAFF` |
| 🟦 | Votant public | *(anonyme, aucun compte)* |
| ⚙️ | Système / API | — |

---

## ACTE 0 — Le décor (état initial)

Une **seule** application tourne : front Next.js 15 (`votezpro.africa`) + API NestJS 11 + une base PostgreSQL **partagée**, cloisonnée par `tenantId`. Au démarrage : aucune donnée métier. Le compte `PLATFORM_ADMIN` est provisionné hors-bande (seed / ops). Quatre acteurs interagissent : admin plateforme, organisateur propriétaire, collaborateur, et votant anonyme.

Modèle de données central :
```
Tenant ─┬─ User (ORGANIZER_OWNER | ORGANIZER_STAFF | PLATFORM_ADMIN)
        ├─ Event ─┬─ Candidate ─┐
        │         └─ Vote ───────┤ (amountCfa, voterPhone, voterPhoneHash)
        ├─ PaymentTransaction (provider feexpay, status, idempotencyKey)
        ├─ AuditLog (immuable)
        ├─ AuthSession (refresh token hashé, rotation)
        └─ TenantSecret (AES-256-GCM)
LoginAttempt   (anti-brute-force, global)
IdempotencyKey (global, transitoire)
```

---

## ACTE 1 — 🟩 Onboarding de l'organisateur (création de la « mini-plateforme »)

### 1.1 Inscription → provisionnement d'un tenant

Awa, présidente de *Campus Africa*, ouvre `/login` (onglet inscription) et soumet :

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "tenantSlug": "campus-africa",
  "tenantDisplayName": "Campus Africa",
  "email": "awa@campus-africa.bj",
  "password": "MotDePasse#2026"
}
```

⚙️ `AuthService.register` :
1. **Validation Zod** : `tenantSlug` 3–60, `tenantDisplayName` 2–120, `email` valide, `password` 8–72.
2. `tenant.findUnique({ slug })` → **si le slug existe déjà : `409 Conflict` « Ce slug d'organisation est déjà utilisé. »** (impossible de rejoindre / squatter un tenant existant — les slugs sont publics).
3. Sinon `tenant.create({ slug, displayName })` (backstop `try/catch` sur la contrainte unique `P2002` pour la race check-then-create).
4. `bcrypt.hash(password, 12)` → `user.create({ tenantId, email, role: ORGANIZER_OWNER })`.
5. **Access token JWT HS256** (`sub`=userId, `tenantId`, `role`, `email`, **exp 15 min**) + `AuthSession` avec refresh token aléatoire (48 octets) **hashé SHA-256** en base.

**Réponse `201`** :
```json
{ "accessToken": "<jwt>" }
```
+ cookie `vp_refresh` : `HttpOnly`, `SameSite=Strict`, `Secure` (prod), `path=/api/v1/auth`, durée 30 j. **Le refresh token n'apparaît jamais dans le body.**

➡️ La mini-plateforme `campus-africa` existe. URL publique réservée : `https://votezpro.africa/vote/campus-africa`.

### 1.2 Récupération d'identité
```http
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
→ 200 { "userId": "...", "tenantId": "...", "role": "ORGANIZER_OWNER", "email": "awa@campus-africa.bj" }
```
Le front affiche `/dashboard`.

### 1.3 Cycle de vie de la session
- **Refresh** : `POST /api/v1/auth/refresh` (cookie auto) → l'ancienne session est **révoquée**, une nouvelle créée (**rotation**), nouvel access token. Si refresh invalide/expiré → `401`.
- **Logout** : `POST /api/v1/auth/logout` → session révoquée + cookie effacé.

---

## ACTE 2 — 🟩 Configuration du concours

### 2.1 Secret de paiement (chiffré par tenant)
```http
POST /api/v1/organizer/secrets   (Bearer)
{ "key": "feexpay_api_secret", "value": "fp_live_xxx" }
```
⚙️ Chiffrement **AES-256-GCM** (clé dérivée par `scrypt`), stocké dans `TenantSecret` avec clé composite `(tenantId, key)`. Relecture : `GET /api/v1/organizer/secrets/feexpay_api_secret` → déchiffré côté serveur. **Aucun autre tenant ne peut lire ce secret** (le `tenantId` vient du JWT, jamais du body).

### 2.2 Création de l'événement
```http
POST /api/v1/events   (Bearer)
{ "slug": "miss-campus-2026", "title": "Miss Campus Bénin 2026",
  "startsAt": "2026-06-01T00:00:00Z", "endsAt": "2026-06-30T23:59:59Z" }
→ 201 { "id": "<eventId>", "status": "DRAFT", ... }
```
⚙️ `Event.create({ tenantId, slug (lowercase), status: DRAFT })`. Unicité `(tenantId, slug)`. Contrôle : `endsAt > startsAt` sinon `400`. **Audit** `event.created`.

### 2.3 Candidats
```http
POST /api/v1/events/{eventId}/candidates   (Bearer)
{ "fullName": "Arielle Dossou", "number": 7 }
→ 201 { "id": "...", "number": 7 }
```
⚙️ Le serveur vérifie d'abord `event.findFirst({ id, tenantId })` (sinon **`404`**), puis crée le candidat. Unicité `(eventId, number)`. Audit `candidate.created`.

### 2.4 Ouverture du vote
```http
PATCH /api/v1/events/{eventId}   (Bearer, ORGANIZER_OWNER ou PLATFORM_ADMIN)
{ "status": "ACTIVE" }
→ 200 { "status": "ACTIVE" }
```
⚙️ **Cycle de vie de l'événement** :
```
DRAFT ──activate──▶ ACTIVE ──close──▶ CLOSED ──archive──▶ ARCHIVED
```
**Le vote n'est ouvert que si `status = ACTIVE` ET `now ∈ [startsAt, endsAt]`.** Audit `event.updated`.

### 2.5 Collaborateurs `ORGANIZER_STAFF` — limite actuelle
⚠️ **Non encore exposé.** Depuis le durcissement sécurité, `register` crée **toujours** un nouveau tenant ; ajouter un membre supplémentaire à un tenant existant nécessitera un **flux d'invitation** (email + token signé, expiration 48 h), réservé à un `ORGANIZER_OWNER` authentifié → suivi en **`TECH_DEBT.md` (TD-003)**. Le rôle `ORGANIZER_STAFF` existe et est reconnu par le RBAC, mais sa création n'a pas d'endpoint public à ce jour.

---

## ACTE 3 — 🟦 Le votant public

### 3.1 Découverte
Marc reçoit `https://votezpro.africa/vote/campus-africa`. La page `/vote/[tenantSlug]` charge :
```http
GET /api/v1/votes/public/campus-africa/events
→ 200 [ { id, slug, title, status, startsAt, endsAt }, ... ]
```
Il clique sur le concours → `/vote/campus-africa/miss-campus-2026` :
```http
GET /api/v1/votes/public/campus-africa/events/miss-campus-2026
→ 200 { "event": {...}, "candidates": [ { id, fullName, number }, ... ] }
```
**États UI** : tenant/event introuvable → `404` (« Organisation/Évènement introuvable ») ; event `DRAFT`/`CLOSED` → bandeau « vote fermé ».

### 3.2 Émission du vote
```http
POST /api/v1/votes/cast
{ "tenantSlug": "campus-africa", "eventSlug": "miss-campus-2026",
  "candidateNumber": 7, "amountCfa": 500, "voterPhone": "22999001122" }
→ 201 { "id": "<voteId>", "amountCfa": 500, ... }
```
⚙️ Résout tenant → event → candidate. **Refus si** `status ≠ ACTIVE` (`400`), **hors fenêtre** `[startsAt, endsAt]` (`400`), candidat inconnu (`404`). Crée `Vote` avec `voterPhone` **et** son hash SHA-256 (`voterPhoneHash`).
> Le `Vote` est créé **avant** le paiement ; le statut financier vit dans `PaymentTransaction`.

### 3.3 Initiation du paiement (Mobile Money / FeexPay)
```http
POST /api/v1/payments/public/init
{ "tenantSlug": "campus-africa", "eventSlug": "miss-campus-2026",
  "voteId": "<voteId>", "amountCfa": 500,
  "idempotencyKey": "<uuid client>", "requestFingerprint": "<empreinte>" }
→ 201 { "transactionId": "...", "provider": "feexpay", "status": "PENDING" }
```
⚙️ Validations en chaîne : tenant → event → **le `vote` appartient bien à ce tenant+event** (`401` sinon) → **`amountCfa` == montant du vote** (`409` sinon). Puis `initPaymentCore` :
- gestion **idempotence** : même clé + même payload → même transaction ; même clé + payload différent → `409` ;
- `PaymentTransaction.upsert` (`provider: feexpay`, `status: PENDING`, devise `XOF`) ;
- audit `payment.initiated`.

En parallèle, FeexPay déclenche le push USSD/Mobile Money sur le téléphone de Marc.

### 3.4 Suivi temps réel (SSE)
```http
GET /api/v1/payments/public/status/stream?tenantSlug=…&eventSlug=…&transactionId=…&voterPhone=…
(text/event-stream)
```
⚙️ Toutes les 3 s, le serveur revérifie la transaction (en re-validant tenant + event + vote + `voterPhone`) et pousse le statut, **jusqu'à `SUCCEEDED` ou `FAILED`** puis ferme le flux.
*Repli sans SSE* : `POST /api/v1/payments/public/status` (polling manuel).

### 3.5 Confirmation par webhook (source de vérité financière)
Marc valide son code PIN. FeexPay appelle :
```http
POST /api/v1/payments/webhooks/feexpay
x-feexpay-signature: <HMAC-SHA256(body, FEEXPAY_WEBHOOK_SECRET)>
{ "providerRef": "fp_123", "idempotencyKey": "<même clé>", "status": "SUCCEEDED" }
→ 201 { "status": "SUCCEEDED" }
```
⚙️ **Vérification HMAC en temps constant** (`timingSafeEqual`) → signature invalide = `401`. Sinon `PaymentTransaction → SUCCEEDED`, `providerRef` enregistré, audit `payment.webhook_processed`. Le flux SSE émet alors `SUCCEEDED` → l'UI affiche « Vote confirmé 🎉 ». Le vote est comptabilisé.

---

## ACTE 4 — 🟩 Pilotage par l'organisateur

| Action | Endpoint | Périmètre |
|--------|----------|-----------|
| Suivi votes/paiements | `/dashboard/events/[id]`, `/dashboard/payments` (UI) | son tenant |
| Revenus / abonnement | `GET /api/v1/admin/subscriptions/overview?from=&to=` | **forcé** sur son `tenantId` |
| Journal d'audit | `GET /api/v1/admin/audit-logs` | son tenant uniquement |
| Encaissement back-office | `POST /api/v1/payments/init` (Bearer) | `tenantId`/`eventId`/`voteId` **doivent** appartenir à son tenant (`403`/`404` sinon) |

⚙️ Pour un `ORGANIZER_OWNER`, toutes les agrégations admin sont **scopées à son `tenantId`** — il ne voit jamais un autre tenant.

---

## ACTE 5 — 🟥 Supervision par l'admin plateforme

### 5.1 Vue globale (cross-tenant, réservée `PLATFORM_ADMIN`)
- `GET /api/v1/admin/users` (option `?tenantId=`, sinon tous)
- `GET /api/v1/admin/audit-logs` (cross-tenant)
- `GET /api/v1/admin/subscriptions/overview` → revenus **par tenant** (MRR plateforme)
- `GET /api/v1/admin/jobs/overview` → paiements pending/échoués, sessions à purger, clés d'idempotence expirées

### 5.2 Feature flags
```http
POST /api/v1/admin/feature-flags   (Bearer admin)
{ "key": "new_vote_ui", "enabled": true, "rolloutPercent": 50, "tenantId": "<optionnel>" }
```
⚙️ Stockés comme secrets chiffrés `feature_flag.*` par tenant. Clé invalide (`!!`) → `400`.

### 5.3 Maintenance
- Manuelle : `POST /api/v1/admin/maintenance/purge` (réservé `PLATFORM_ADMIN`).
- Automatisée (cron serverless signé) :
```http
POST /api/v1/maintenance/cron/purge
x-maintenance-cron-signature: <HMAC(body, API_MAINTENANCE_CRON_SECRET)>
{ "tenantSlug": "campus-africa", "auditLogsRetentionDays": 365,
  "idempotencyRetentionDays": 30, "revokedSessionsRetentionDays": 30, "runAtIso": "..." }
```
⚙️ HMAC + fenêtre anti-rejeu (`runAtIso` ± skew) + **idempotence par tenant+jour**. La purge est **strictement scopée au tenant** résolu (audit logs & sessions). Tables globales purgées platform-wide : clés d'idempotence expirées, compteurs de brute-force non verrouillés (`LoginAttempt`).

### 5.4 Observabilité
- `GET /api/v1/ops/metrics` (header `x-ops-token`, comparé en **temps constant**) → snapshot p95 / taux d'erreur.
- Healthchecks : `GET /api/v1/health`, `GET /api/v1/health/ready`.
- Logs JSON structurés + `x-trace-id` + Sentry (API & web).

---

## ACTE 6 — Conformité & fin de vie

- **RGPD** (🟦/🟩 authentifié) : `GET /api/v1/privacy/export` → **archive ZIP** ; `DELETE /api/v1/privacy/delete` → **anonymisation** (email → `deleted+…@anonymized.vzp`) + **révocation de toutes les sessions**. Audité.
- **Clôture** (🟩) : `PATCH /events/{id} {status:"CLOSED"}` puis `"ARCHIVED"`.
- **Pages légales** : `/privacy`, `/terms`, `/cookies`, `/legal` + centre de consentement cookies (necessary/analytics/marketing) avec preuve horodatée.

---

## ACTE 7 — Les garde-fous (ce qui échoue, par conception)

| Tentative | Résultat | Mécanisme |
|-----------|----------|-----------|
| 🟥 S'inscrire avec un slug existant | **409** | `register` refuse de rejoindre un tenant existant |
| 🟦 5 mauvais mots de passe | **verrouillage 15 min** (`401`) | `LoginAttempt` en PostgreSQL (multi-instances) ; 6ᵉ tentative bloquée même avec le bon mot de passe |
| 🟩 Tenant B initie un paiement avec le `tenantId` de A | **403** | contrôle d'appartenance dans `payments/init` |
| 🟩 Tenant B vise l'`eventId` de A | **404** | `findFirst({ id, tenantId })` |
| 🟦 Webhook FeexPay non signé / signature fausse | **401** | HMAC `timingSafeEqual` |
| 🟦 Payer un montant ≠ celui du vote | **409** | recoupement montant vote/paiement |
| Réutiliser une clé d'idempotence avec un autre payload | **409** | `IdempotencyKey.requestHash` |
| Accès `/ops/metrics` sans / mauvais token | **403** | comparaison constant-time |
| Voter sur un event `DRAFT`/`CLOSED` ou hors fenêtre | **400** | contrôle statut + dates |

---

## Vue d'ensemble (chaîne de valeur)

```
🟥 PLATFORM_ADMIN ─ supervise tous les tenants (audit, MRR, flags, maintenance, ops)
        │
        ▼
🟩 ORGANIZER_OWNER ─ register → tenant "campus-africa"
        ├─ secrets FeexPay (AES-256-GCM)
        ├─ Event "miss-campus-2026" : DRAFT → ACTIVE → CLOSED → ARCHIVED
        ├─ Candidates (n°1..N)
        └─ dashboard : votes, paiements, revenus (scopés tenant)
        │
        ▼  /vote/campus-africa/miss-campus-2026
🟦 VOTER ─ cast vote → payment public/init (FeexPay) → SSE temps réel
                                   │
                                   ▼
                    ⚙️ webhook HMAC → SUCCEEDED → vote comptabilisé
```

---

## Précisions d'honnêteté (non implémenté dans le code actuel)

- **Invitation de membres** `ORGANIZER_STAFF` (TD-003) — pas d'endpoint public à ce jour.
- **Emails transactionnels** (welcome / relance d'activation) — aucune infrastructure email présente dans le code.
- **Rate-limit global** `@nestjs/throttler` encore **en mémoire** (per-instance) — voir TD-001 ; le contrôle anti-brute-force **primaire** (lockout) est, lui, durable (PostgreSQL).
- **Sous-domaines par organisateur** (`{slug}.votezpro.africa`) — visés par l'architecture, mais le routage actuel est **par chemin** (`/vote/{slug}`).

---

## Référence rapide des endpoints

| Domaine | Méthode & route | Auth |
|---------|-----------------|------|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` ; `GET /auth/me` | public / cookie / Bearer |
| Events | `GET/POST /events` ; `PATCH /events/:id` ; `GET/POST /events/:id/candidates` | Bearer + RBAC |
| Vote public | `GET /votes/public/:tenantSlug/events` ; `GET …/events/:eventSlug` ; `POST /votes/cast` | public |
| Paiements | `POST /payments/public/init` ; `POST /payments/public/status` ; `GET /payments/public/status/stream` (SSE) ; `POST /payments/webhooks/feexpay` (HMAC) ; `POST /payments/init` | public / signé / Bearer |
| Secrets | `POST /organizer/secrets` ; `GET /organizer/secrets/:key` | Bearer |
| Admin | `GET /admin/audit-logs`, `/admin/users`, `/admin/jobs/overview`, `/admin/subscriptions/overview` ; `GET/POST /admin/feature-flags` ; `POST /admin/maintenance/purge`, `/admin/maintenance/migrate-secrets` | Bearer + RBAC |
| Maintenance cron | `POST /maintenance/cron/purge` | HMAC signé |
| Ops / santé | `GET /ops/metrics` (x-ops-token) ; `GET /health`, `/health/ready` | token / public |
| RGPD | `GET /privacy/export` ; `DELETE /privacy/delete` | Bearer |
