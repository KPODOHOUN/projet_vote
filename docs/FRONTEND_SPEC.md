# SHADOMA Votes — Blueprint de reconstruction frontend (`apps/web`)

> **But du document** : permettre de **refaire l'intégralité du frontend à partir de zéro**, en se basant uniquement sur le **backend NestJS existant** (le backend est la source de vérité). Tout écran, toute donnée, toute validation, tout état décrit ici est **dérivé d'un endpoint réel** d'`apps/api` (vérifié par lecture du code, audit 2026-05-31).
>
> **Règle d'or** : le frontend ne décide de rien que le backend ne sache déjà faire. Aucune donnée affichée sans endpoint. Aucune validation côté client qui ne reflète le schéma Zod backend. Aucun écran sans ses 6 états.

---

## 0. Comment utiliser ce document

1. Lire §1 (modèle de domaine) et §2 (acteurs/rôles) pour comprendre quoi on représente.
2. §3 = **contrat d'API complet** : la référence technique de tous les appels.
3. §4 = **carte des routes** de la nouvelle app (from scratch).
4. §5 = **spec écran par écran**, chacun relié à ses endpoints, états, validations, erreurs.
5. §6 = décisions d'archi frontend (stack, client API, auth, états, sécurité, i18n, design).
6. §7 = validations client (miroir des schémas Zod backend).
7. §8 = ordre de construction.

Chaque écran de §5 suit le gabarit : **Route · Accès · Données (endpoints) · Actions · États · Validations · Erreurs/cas limites.**

---

## 1. Modèle de domaine (ce que l'UI représente)

Dérivé du schéma Prisma (`packages/db`). Le frontend ne manipule que ces entités via l'API.

| Entité | Champs exposés à l'UI | Notes |
|--------|----------------------|-------|
| **Tenant** (organisateur) | `id, slug, displayName, logoUrl?, brandColor?, commissionBps?` | Le compte. `slug` est public. |
| **User** | `id, tenantId, email, role` | Membre d'un tenant. |
| **Event** (concours) | `id, tenantId, slug (unique global), title, status, startsAt, endsAt, tagline?, logoUrl?, brandColor?, voteUnitPriceCfa?, commissionBps?, activationPaidAt?` | **Unité publique** (ADR-016), atteint par `/e/{slug}`. |
| **Candidate** | `id, eventId, fullName, number` | `number` unique par event. |
| **Vote** | `id, eventId, candidateId, amountCfa, voterPhone, createdAt, cancelledAt?, cancelledReason?` | **Ne compte qu'une fois PAYÉ** (voir invariant). |
| **PaymentTransaction** | `id, status, provider, providerRef?, amountCfa, purpose, commissionCfa?, voteId?, eventId, tenantId` | FeexPay mobile money. |
| **Invitation** | `id, email, role, status, expiresAt, acceptedAt?, createdAt` | Token affiché 1×. |
| **AuditLog** | `id, action, actorUserId, actorRole, targetType, targetId, metadata, createdAt` | Lecture admin. |
| **PlatformSetting** | `commissionBps, activationFeeCfa` | God-mode plateforme. |

### Enums (valeurs exactes à utiliser dans l'UI)
- `UserRole` : `PLATFORM_ADMIN | ORGANIZER_OWNER | ORGANIZER_STAFF`
- `EventStatus` : `DRAFT | ACTIVE | CLOSED | ARCHIVED`
- `PaymentStatus` : `INITIATED | PENDING | SUCCEEDED | FAILED | VOIDED`
- `PaymentPurpose` : `VOTE | ACTIVATION`
- `InvitationStatus` : `PENDING | ACCEPTED | EXPIRED | REVOKED`

### 🔒 Invariant produit (à refléter partout)
**Un vote ne compte dans aucun résultat tant que son paiement n'est pas `SUCCEEDED`.** `castVote` crée une ligne *non payée* ; les tallies (publics, organisateur, plateforme) excluent les votes non payés et annulés. L'UI doit l'afficher explicitement (« vote en attente de paiement — non comptabilisé »).

---

## 2. Acteurs & matrice rôle → capacités

Dérivée des `@Roles(...)` des contrôleurs. **La garde front est UX only** : l'autorité reste le backend (RBAC + isolation `tenantId`).

| Capacité | PLATFORM_ADMIN | ORGANIZER_OWNER | ORGANIZER_STAFF | Public (anonyme) |
|----------|:--:|:--:|:--:|:--:|
| Voter + payer (`/e/{slug}`) | — | — | — | ✅ |
| Voir résultats publics | ✅ | ✅ | ✅ | ✅ |
| Créer/lister events, candidats | ✅ | ✅ | ✅ | — |
| Éditer event / changer statut (`PATCH`) | ✅ | ✅ | — | — |
| Payer l'activation | ✅ | ✅ | ✅ | — |
| Secrets FeexPay (org/event) | ✅ | ✅ | ✅ | — |
| Inviter / révoquer membres | ✅ | ✅ | — | — |
| Lister invitations | ✅ | ✅ | ✅ | — |
| Admin léger (users/flags/audit/jobs/subs) — **scopé tenant** pour OWNER | ✅ (cross-tenant) | ✅ (son tenant) | — | — |
| God-mode plateforme (overview/commissions/votes cancel/delete) | ✅ | — | — | — |
| Export/suppression RGPD (son compte) | ✅ | ✅ | ✅ | — |

---

## 3. Contrat d'API backend (référence exhaustive)

> Préfixe : **`/api/v1`**. « Auth » = header `Authorization: Bearer <accessToken>`. « Cookie » = `vp_refresh` httpOnly (posé/rafraîchi par le serveur). Réponse d'erreur standard : `{ statusCode, message, path, traceId, timestamp }` (+ `errors[]` sur validation Zod). Throttle global : 120 req/min/IP.

### Auth — `/auth`
| Méthode | Path | Auth | Body | Réponse | Notes |
|--------|------|------|------|---------|-------|
| POST | `/auth/register` | — | `{tenantSlug,tenantDisplayName,email,password}` | `{accessToken}` + cookie | `409` slug pris ; throttle 5/min |
| POST | `/auth/login` | — | `{tenantSlug,email,password}` | `{accessToken}` + cookie | lockout 5 échecs → 15 min ; throttle 10/min |
| POST | `/auth/refresh` | Cookie | — | `{accessToken}` + cookie rotaté | throttle 20/min |
| POST | `/auth/logout` | Cookie | — | `{success:true}` | efface cookie |
| POST | `/auth/accept-invitation` | — | `{token,password}` | `{accessToken}` + cookie | `401` invalide/expirée, `409` déjà membre ; throttle 5/min |
| GET | `/auth/me` | Auth | — | `{userId,tenantId,role,email}` | source du contexte session |

### Events — `/events` (Auth + rôles)
| Méthode | Path | Rôles | Body/Query | Réponse |
|--------|------|-------|-----------|---------|
| GET | `/events` | tous | — | `Event[]` (tenant courant) |
| POST | `/events` | tous | `{slug,title,startsAt,endsAt,tagline?,logoUrl?,brandColor?,voteUnitPriceCfa?}` | `Event` (DRAFT) ; `409` slug global pris |
| GET | `/events/:id/candidates` | tous | — | `Candidate[]` |
| POST | `/events/:id/candidates` | tous | `{fullName,number}` | `Candidate` |
| GET | `/events/:id/results` | tous | — | `{eventId,results[],totals}` — **PAYÉS only** |
| PATCH | `/events/:id` | OWNER, ADMIN | `{status?,title?,startsAt?,endsAt?,tagline?,logoUrl?,brandColor?,voteUnitPriceCfa?}` | `Event` ; `status:"ACTIVE"` → **`402`** si forfait impayé |

### Votes (public) — `/votes`
| Méthode | Path | Body/Query | Réponse |
|--------|------|-----------|---------|
| GET | `/votes/public/event/:eventSlug` | — | `{organizer{displayName,slug}, event{slug,title,status,startsAt,endsAt,voteUnitPriceCfa,branding{logoUrl,brandColor,tagline}}, candidates[{id,fullName,number}]}` **(ADR-016, route principale)** |
| GET | `/votes/public/event/:eventSlug/results` | — | `{event{id,slug,title,status}, results[{candidateId,fullName,number,voteCount,totalAmountCfa}], totals{votes,amountCfa}}` — **PAYÉS only** |
| GET | `/votes/public/:tenantSlug/events` | — | `[{id,slug,title,status,startsAt,endsAt}]` (legacy, optionnel) |
| GET | `/votes/public/:tenantSlug/events/:eventSlug` | — | `{event,candidates}` (legacy) |
| POST | `/votes/cast` | `{tenantSlug,eventSlug,candidateNumber,amountCfa,voterPhone}` | `Vote` ; `400` si non ACTIVE / hors période / montant ≠ prix unitaire ; throttle 10/min |

### Paiements — `/payments`
| Méthode | Path | Auth | Body/Query | Réponse |
|--------|------|------|-----------|---------|
| POST | `/payments/public/init` | — | `{tenantSlug,eventSlug,voteId,amountCfa,idempotencyKey,requestFingerprint?}` | `{transactionId,provider,status}` ; montant doit = `vote.amountCfa` (`409`) |
| POST | `/payments/public/status` | — | `{tenantSlug,eventSlug,transactionId,voterPhone}` | `{transactionId,status,provider,providerRef,updatedAt}` |
| GET (SSE) | `/payments/public/status/stream` | — | query `tenantSlug,eventSlug,transactionId,voterPhone` | flux de snapshots, stop à `SUCCEEDED`/`FAILED` |
| POST | `/payments/activation/init` | Auth+rôles | `{eventId,idempotencyKey,requestFingerprint?}` | `{transactionId,provider,status}` ; montant **résolu serveur** ; `409` si déjà payé |
| POST | `/payments/init` | Auth+rôles | `{tenantId,eventId,voteId?,amountCfa,idempotencyKey,requestFingerprint?}` | `{transactionId,provider,status}` |

> Le webhook `POST /payments/webhooks/feexpay` est **provider-only** (HMAC) → pas d'UI.

### Admin léger (scopé) — `/admin` (Auth + PLATFORM_ADMIN | ORGANIZER_OWNER)
| Méthode | Path | Query | Réponse |
|--------|------|-------|---------|
| GET | `/admin/users` | `limit(1-100,déf25),cursor,role,email,tenantId?` | `{items[{id,tenantId,email,role,createdAt,updatedAt}],nextCursor}` |
| GET | `/admin/feature-flags` | `tenantId?` | `{tenantId,items[{key,enabled,rolloutPercent,updatedAt}]}` |
| POST | `/admin/feature-flags` | — | `{key,enabled,rolloutPercent,tenantId?}` |
| GET | `/admin/jobs/overview` | — | `{pendingPayments,stalePendingPayments,failedPayments24h,expiredIdempotencyKeys,revokedSessionsToPurge,recentMaintenanceRuns[]}` |
| GET | `/admin/subscriptions/overview` | `from?,to?` | `{window,totals{tenantsWithRevenue,activeSubscriptions,totalRevenueCfa},items[]}` |
| GET | `/admin/audit-logs` | `limit,cursor,action,actorUserId,targetType,from,to,tenantId?` | `{items,nextCursor}` |

> OWNER ne voit **que son tenant** (forcé serveur). `tenantId` en query n'agit que pour PLATFORM_ADMIN.

### God-mode plateforme — `/admin/platform` (Auth + **PLATFORM_ADMIN only**)
| Méthode | Path | Body | Réponse |
|--------|------|------|---------|
| GET | `/admin/platform/overview` | — | `{tenants,events,votes{active,cancelled},grossRevenueCfa,commissionCfa,netToOrganizersCfa}` |
| GET | `/admin/platform/settings` | — | `{commissionBps,activationFeeCfa}` |
| PUT | `/admin/platform/settings` | `{commissionBps?,activationFeeCfa?}` | settings |
| PUT | `/admin/platform/settings/commission` | `{commissionBps}` | `{commissionBps}` |
| PUT | `/admin/platform/events/:eventId/commission` | `{commissionBps:number\|null}` | `{eventId,commissionBps}` |
| PUT | `/admin/platform/tenants/:tenantId/commission` | `{commissionBps:number\|null}` | `{tenantId,commissionBps}` |
| GET | `/admin/platform/votes` | `eventId?,includeCancelled?,limit,cursor` | `{items,nextCursor}` |
| POST | `/admin/platform/votes/:voteId/cancel` | `{reason}` | `{voteId,cancelled,paymentVoided}` (soft-void audité) |
| DELETE | `/admin/platform/votes/:voteId` | — | `{voteId,deleted,paymentVoided}` (**hard delete silencieux, sans audit**) |

> Les changements de **commission sont silencieux** (aucun audit log) — ne jamais les surfacer dans une vue d'audit organisateur.

### Invitations — `/organizer/invitations` (Auth + rôles)
| Méthode | Path | Rôles | Body | Réponse |
|--------|------|-------|------|---------|
| POST | `/organizer/invitations` | OWNER, ADMIN | `{email,role:ORGANIZER_OWNER\|ORGANIZER_STAFF}` | `{id,email,role,token,expiresAt}` — **token visible 1×** |
| GET | `/organizer/invitations` | tous | — | `{items[...]}` |
| DELETE | `/organizer/invitations/:id` | OWNER, ADMIN | — | `{id,status:REVOKED}` (PENDING only) |

### Secrets — `/organizer/secrets` (Auth + OWNER/STAFF/ADMIN)
| Méthode | Path | Body | Réponse |
|--------|------|------|---------|
| POST | `/organizer/secrets` | `{key,value}` | `{key,updatedAt}` |
| GET | `/organizer/secrets/:key` | — | `{key,value}` (clair → **masquer à l'écran**) |
| POST | `/organizer/secrets/events/:eventId` | `{key,value}` | `{eventId,key,updatedAt}` |
| GET | `/organizer/secrets/events/:eventId/:key` | — | `{eventId,key,value}` |

Clé du compte de paiement : `feexpay_api_secret` (résolution event → org).

### RGPD — `/privacy` (Auth)
| Méthode | Path | Réponse |
|--------|------|---------|
| GET | `/privacy/export` | **ZIP** (`Content-Disposition: attachment`) |
| DELETE | `/privacy/delete` | `{success,anonymizedEmail}` (anonymise + révoque sessions → déconnexion) |

### Santé
`GET /health`, `GET /health/ready` (publics). `GET /ops/metrics` (header `x-ops-token`) = ops, pas d'UI.

---

## 4. Carte des routes (nouvelle app, from scratch)

```
PUBLIC
  /                                  Landing marketing
  /e/[eventSlug]                     ★ Page plateforme de l'événement (vote + paiement live)
  /e/[eventSlug]/resultats           ★ Résultats publics (votes payés)
  /login                             Connexion organisateur
  /register                          Inscription (provisionne un tenant)
  /auth/accept-invitation            Acceptation d'invitation (?token=)
  /privacy /terms /cookies /legal    Légal + centre de consentement

ORGANISATEUR (auth, layout /dashboard)
  /dashboard                         Accueil (KPIs du tenant)
  /dashboard/events                  Liste des events
  /dashboard/events/new              Création d'event
  /dashboard/events/[id]             Détail/édition (infos, branding, statut, activation)
  /dashboard/events/[id]/candidates  Gestion candidats
  /dashboard/events/[id]/results     Résultats (vue organisateur)
  /dashboard/events/[id]/payment     Secret FeexPay par event
  /dashboard/team                    Invitations membres (OWNER/ADMIN)
  /dashboard/settings                Compte : logout, secret org, RGPD (export/suppression)
  /dashboard/admin/users             Utilisateurs (scopé tenant)
  /dashboard/admin/audit-logs        Journal d'audit
  /dashboard/admin/jobs              Overview jobs/paiements
  /dashboard/admin/subscriptions     Revenus/abonnements
  /dashboard/admin/feature-flags     Feature flags

PLATEFORME (auth, PLATFORM_ADMIN only, layout /dashboard/platform)
  /dashboard/platform                Overview cross-tenant
  /dashboard/platform/settings       Commission globale + forfait activation
  /dashboard/platform/votes          Votes : annuler (audité) / supprimer (silencieux)
  /dashboard/platform/commissions    Overrides commission par event/tenant

SYSTÈME
  not-found (404), error (500), offline
```

---

## 5. Spécification écran par écran

> Gabarit : **Route · Accès · Données · Actions · États · Validations · Erreurs.**

### 5.1 `/e/[eventSlug]` — Page plateforme de l'événement ★ cœur produit
- **Accès** : public.
- **Données** : `GET /votes/public/event/:eventSlug`. Résultats live (optionnel, encart) : `GET /votes/public/event/:eventSlug/results`.
- **Branding** : appliquer `event.branding.{logoUrl,brandColor,tagline}` (fallback organisateur déjà résolu côté API) → injecter `brandColor` en variable CSS `--vp-brand`.
- **Actions / flux de vote** :
  1. Choix candidat (liste `candidates`) + montant + téléphone. Si `voteUnitPriceCfa` non null → champ montant **verrouillé** à cette valeur.
  2. `POST /votes/cast` → `voteId`.
  3. `POST /payments/public/init {tenantSlug:organizer.slug, eventSlug, voteId, amountCfa, idempotencyKey}`.
  4. Suivi temps réel : **SSE** `/payments/public/status/stream` ; **fallback polling** `/payments/public/status` toutes 3 s (max ~40 essais) si SSE échoue.
- **États** :
  - `loading` (skeleton event + candidats),
  - `error` (event introuvable → 404 brandé),
  - event `DRAFT`/`CLOSED`/`ARCHIVED` ou hors `[startsAt,endsAt]` → **vote désactivé** + bandeau explicite,
  - en cours de paiement `INITIATED/PENDING` → spinner + « en attente de confirmation — **non comptabilisé** »,
  - `SUCCEEDED` → « **Vote confirmé et comptabilisé** » (feedback fort),
  - `FAILED` → « paiement refusé, réessayez »,
  - `offline`/SSE coupé → bascule polling automatique.
- **Validations client** (miroir backend) : `voterPhone` 8–20, `candidateNumber` entier > 0, `amountCfa` entier > 0 (= prix unitaire si fixé), `idempotencyKey` ≥ 16 (générer un UUID/clé unique par tentative).
- **Erreurs** : `400` (event fermé/hors période/montant), `409` (montant ≠ vote), `429` (« trop de votes, patientez »). Désactiver le bouton pendant la soumission (anti double-clic).

### 5.2 `/e/[eventSlug]/resultats` — Résultats publics
- **Accès** : public. **Données** : `GET /votes/public/event/:eventSlug/results`.
- **Affichage** : classement candidats (`voteCount`, `totalAmountCfa`), total. Mention « **résultats = votes payés uniquement** ». Refresh périodique (10 s) + bouton manuel.
- **États** : loading, empty (0 vote payé → « aucun vote confirmé pour l'instant »), error.

### 5.3 `/login`
- **Accès** : public. **Données** : `POST /auth/login`.
- **Champs** : `tenantSlug`, `email`, `password`. **Succès** : stocker `accessToken`, cookie posé serveur → redirect `/dashboard`.
- **États/erreurs** : `401` identifiants invalides (message neutre, pas d'énumération), **lockout** après 5 échecs (afficher le délai renvoyé), `429`. Lien vers `/register`.

### 5.4 `/register`
- **Accès** : public. **Données** : `POST /auth/register`.
- **Champs** : `tenantSlug` (slug public, indиquer le format), `tenantDisplayName`, `email`, `password` (+ indicateur de force).
- **Validations** : slug 3–60 `[a-z0-9-]`, displayName 2–120, email valide, password 8–72.
- **Erreurs** : `409` slug déjà pris (message clair + suggestion d'alternative), `429`. Succès → token + redirect `/dashboard`.

### 5.5 `/auth/accept-invitation`
- **Accès** : public, lit `?token=`. **Données** : `POST /auth/accept-invitation {token,password}`.
- **Champs** : mot de passe + confirmation. **Erreurs** : `401` invalide/expirée (proposer de redemander), `409` déjà membre. Succès → token + redirect `/dashboard`.

### 5.6 `/dashboard` (accueil organisateur)
- **Accès** : auth. **Données** : `GET /auth/me` (contexte), `GET /events` (compteurs), éventuellement `GET /admin/jobs/overview` si OWNER.
- **Contenu** : KPIs (nb events, par statut), raccourcis (créer event, équipe, settings). **États** : loading, empty (aucun event → CTA « créer votre premier concours »), error.

### 5.7 `/dashboard/events`
- **Données** : `GET /events`. Table : titre, slug (`/e/{slug}`), statut (`StatusChip`), période, prix unitaire. **Actions** : lien détail, lien public, « nouveau ». **États** : loading/empty/error.

### 5.8 `/dashboard/events/new`
- **Accès** : tous rôles. **Données** : `POST /events`.
- **Champs** : `slug, title, startsAt, endsAt, tagline?, logoUrl?, brandColor?, voteUnitPriceCfa?`.
- **Validations** : slug 3–80, title 3–160, dates ISO et `endsAt > startsAt`, tagline 2–200, logoUrl URL ≤ 500, brandColor hex (`#RGB`/`#RRGGBB`), voteUnitPriceCfa entier > 0 ≤ 10 000 000.
- **Erreurs** : `409` slug global pris. Succès → redirect détail. Event créé en `DRAFT`.

### 5.9 `/dashboard/events/[id]` — Détail / édition
- **Accès** : lecture tous ; édition (`PATCH`) **OWNER/ADMIN** (masquer les contrôles d'édition pour STAFF).
- **Données** : event (filtrer `GET /events` par id), `GET /events/:id/results` (résumé), statut `activationPaidAt`.
- **Onglets** : **Infos & dates** · **Branding** (logo, couleur, tagline, prix unitaire) · **Candidats** (→ 5.10) · **Résultats** (→ 5.11) · **Activation**.
- **Cycle de vie** : `PATCH {status}` pour `DRAFT→ACTIVE→CLOSED→ARCHIVED`.
- **Activation payante (clé)** : si `PATCH {status:"ACTIVE"}` renvoie **`402`** → afficher le forfait requis et lancer `POST /payments/activation/init {eventId,idempotencyKey}` → suivre le paiement (réutiliser le pattern statut) → une fois `activationPaidAt` posé, réessayer l'activation. Afficher l'état « forfait réglé » sinon.
- **États** : loading/empty(candidats absents → bloquer activation UX)/error/success ; `402` traité comme un flux, pas une erreur sèche.

### 5.10 `/dashboard/events/[id]/candidates`
- **Données** : `GET /events/:id/candidates`, `POST /events/:id/candidates`.
- **Champs création** : `fullName` (2–160), `number` (entier > 0, unique par event). **Erreurs** : `409`/contrainte si numéro déjà pris. **États** : loading/empty(« ajoutez vos candidats »)/error.

### 5.11 `/dashboard/events/[id]/results`
- **Données** : `GET /events/:id/results`. Classement (payés), totaux. Bouton export CSV (côté client). **États** : loading/empty(« aucun vote payé »)/error.

### 5.12 `/dashboard/events/[id]/payment` — Secret FeexPay par event
- **Accès** : OWNER/ADMIN. **Données** : `POST /organizer/secrets/events/:id {key:"feexpay_api_secret",value}` ; lecture masquée via `GET .../events/:id/feexpay_api_secret`.
- **UX** : mention « hérite du compte organisateur si vide » ; afficher `••••••` ; ne jamais mettre la valeur en cache/URL.

### 5.13 `/dashboard/team` — Invitations
- **Accès** : OWNER/ADMIN (STAFF = lecture seule). **Données** : `GET/POST/DELETE /organizer/invitations`.
- **Créer** : `{email, role}` → **afficher le token une seule fois** + lien `/auth/accept-invitation?token=...` (bouton copier, avertir qu'il ne réapparaîtra pas). **Révoquer** : `DELETE` (PENDING only). **États** : loading/empty/error ; statut par invitation (`StatusChip`).

### 5.14 `/dashboard/settings` — Compte
- **Logout** : `POST /auth/logout` + purge token local + redirect `/login`.
- **Secret FeexPay org** : `POST /organizer/secrets {key:"feexpay_api_secret",value}` (masqué).
- **RGPD** : **Exporter** (`GET /privacy/export` → download blob ZIP) ; **Supprimer mon compte** (`DELETE /privacy/delete` → double confirmation → déconnexion forcée).

### 5.15 `/dashboard/admin/*` (admin léger, scopé tenant pour OWNER)
- **users** : `GET /admin/users` (pagination `cursor`, filtres `role`/`email`). **audit-logs** : `GET /admin/audit-logs` (filtres `action`,`from`,`to`, pagination). **jobs** : `GET /admin/jobs/overview` (compteurs). **subscriptions** : `GET /admin/subscriptions/overview` (revenus, fenêtre `from/to`). **feature-flags** : `GET/POST /admin/feature-flags`.
- **États** : loading/empty/error ; `403` propre si rôle insuffisant. Pagination par curseur partout.

### 5.16 `/dashboard/platform/*` — God-mode (PLATFORM_ADMIN only)
- **overview** : `GET /admin/platform/overview` → `KpiCard` (tenants, events, votes actifs/annulés, revenu brut, commission, net organisateurs).
- **settings** : `PUT /admin/platform/settings {commissionBps?,activationFeeCfa?}` (+ commission seule via `/settings/commission`). **Pas de feedback d'audit** (silencieux) — confirmation locale seulement.
- **commissions** : overrides `PUT .../events/:id/commission` et `.../tenants/:id/commission` (valeur 0–10000 ou `null` = réinitialiser).
- **votes** : `GET /admin/platform/votes?eventId&includeCancelled&cursor`. Par ligne : **Annuler** (`POST .../votes/:id/cancel {reason}` — reason 3–500, soft-void audité) ; **Supprimer** (`DELETE .../votes/:id` — **double confirmation « irréversible et invisible »**). Afficher `paymentVoided`.
- **Garde** : ne pas monter ces pages si `role !== PLATFORM_ADMIN` (le back renvoie `403` de toute façon).

---

## 6. Décisions d'architecture frontend (pour la reconstruction)

### 6.1 Stack
- **Next.js 15 (App Router) + React 19 + TypeScript strict** (déjà en place, à conserver).
- **Pas de SSR des données privées** : pages dashboard en composants client qui appellent l'API (le backend porte l'auth). Les pages publiques (`/e/[slug]`) peuvent être Server Components pour le SEO + fetch initial, avec hydratation client pour le flux de vote.
- **Data layer** : introduire **TanStack Query** (recommandé) pour cache, refetch, états loading/error normalisés, et invalidation après mutation — sinon, hooks `useResource` maison. *(Décision ADR à acter ; aujourd'hui : `fetch` brut.)*
- **Styling** : conserver le **design-system** (`design-system/`) + tokens ; Tailwind optionnel mais aligner sur `tokens.ts`.

### 6.2 Client API unique (`lib/api.ts`)
- `apiFetch<T>(path, {method, body, auth?})` : base `NEXT_PUBLIC_API_BASE_URL` (déf `http://localhost:3001/api/v1`), `credentials:'include'`, `Content-Type: application/json`.
- **`authedFetch`** : attache `Authorization: Bearer` automatiquement + **refresh transparent sur `401`** via `POST /auth/refresh` (cookie) puis rejoue la requête ; si le refresh échoue → purge + redirect `/login`.
- **Parser d'erreur** : lire le JSON `{statusCode,message,errors?,traceId}` → exposer un objet typé ; afficher `traceId` dans les messages.

### 6.3 Session & garde de route
- Contexte `SessionProvider` : au montage du layout `/dashboard`, `GET /auth/me` → `{userId,tenantId,role,email}` ; pas de token → redirect `/login`.
- Navigation conditionnelle par `role` (cf. §2). **Rappel sécurité** : garde = UX ; ne jamais *fetcher* une donnée qu'on veut cacher.

### 6.4 Gestion d'erreur & codes
`401`→refresh puis reconnexion · `402`→**flux d'activation payante** · `403`→« non autorisé » · `404`→page brandée · `409`→conflit (slug, idempotence, déjà membre, montant) · `429`→« trop de tentatives » · `5xx`→message générique + `traceId`.

### 6.5 États obligatoires (chaque vue)
`loading` (skeleton), `empty` (illustration + CTA réel), `error` (message humain + retry + traceId), `success`, `partial` (pagination curseur / streaming), `offline` (SSE→polling, bannière réseau).

### 6.6 Temps réel (paiement)
Pattern unique réutilisable : `usesPaymentStatus(txId, ctx)` → ouvre `EventSource` sur `/payments/public/status/stream`, ferme sur `SUCCEEDED|FAILED`, **fallback polling** `/payments/public/status` à 3 s si `onerror`. Fermer proprement au démontage.

### 6.7 Sécurité front
- Access token en `localStorage` = exposé XSS → **jamais** de `dangerouslySetInnerHTML` avec données non fiables ; CSP stricte ; (option : token en mémoire seule).
- Secrets/téléphones : **affichage masqué**, pas de cache, pas dans l'URL, pas dans les logs/Sentry (scrubber).
- CSRF : les mutations sensibles passent par `Authorization: Bearer` (pas seulement le cookie) ; le cookie refresh est `SameSite=strict`.

### 6.8 i18n (FR/EN)
- **Aucune string en dur** : passer par `t()` (next-intl recommandé ; aujourd'hui `useI18n` maison). Clés hiérarchiques. Formats via `Intl` (dates, **monnaie XOF/FCFA**, entiers sans décimale). FR par défaut.

### 6.9 Design direction (tokens existants à réutiliser)
- Fonts : **Fraunces** (display), **Manrope** (body), **JetBrains Mono**. Couleurs : `brand` (bleu `#2E5BFF`…`#0A2540`), `neutral`, `state` (success/warning/error/info).
- Composants design-system : `Button, Input, EmptyState, KpiCard, StatusChip, TrustBadge`. `StatusChip` mappé sur `EventStatus`/`PaymentStatus`.
- **Wow factor** : la page `/e/[slug]` doit être marquante (branding organisateur, animation de confirmation de vote). Respecter `prefers-reduced-motion`. Mobile-first (votants sur mobile + mobile money).

### 6.10 Observabilité & qualité
- Sentry (déjà câblé) ; remonter les erreurs inattendues, afficher `traceId`.
- Tests **Playwright E2E** par parcours critique : vote public + paiement, register, activation `402`→paiement→`ACTIVE`, god-mode annulation de vote.

---

## 6bis. Authentification — parcours & implications

> Dérivé du backend réel (`auth.service`, `auth.controller`, guards). **À lire avant de coder le socle (§8.1).**

### Le modèle en bref
- **Access token** : JWT HS256, **15 min**, renvoyé dans le corps JSON `{accessToken}`, à envoyer en `Authorization: Bearer …`.
- **Refresh token** : cookie **httpOnly** `vp_refresh` (30 j, `secure` en prod, `sameSite=strict`, `path=/api/v1/auth`), **illisible en JS**, posé/rotaté/effacé par le serveur.
- Le backend fait de la **rotation single-use + détection de réutilisation** : présenter un refresh token déjà tourné **révoque toute la chaîne de sessions** (logout total).

### Parcours (journeys)

**J1 — Démarrage de l'app / restauration de session**
```
App boot → token en mémoire ? 
  non → POST /auth/refresh (cookie)         (credentials:'include', pas de body)
        ├─ 200 → access token en mémoire → app connectée
        └─ 401 → /login
  oui → GET /auth/me (hydrate role/tenantId/email) → app connectée
```

**J2 — Inscription** `/register`
```
form → POST /auth/register {tenantSlug,tenantDisplayName,email,password}
  201 → garder accessToken (mémoire) ; cookie vp_refresh posé → /dashboard
  409 → « slug déjà pris » (proposer une alternative)
  429 → « trop de tentatives »
```

**J3 — Connexion** `/login`
```
form → POST /auth/login {tenantSlug,email,password}
  201 → accessToken (mémoire) + cookie → /dashboard
  401 « Identifiants invalides » → message neutre
  401 « …verrouillé… N secondes » → afficher un COMPTE À REBOURS (lockout 5 échecs/15 min)
  429 → throttle (10/min)
```

**J4 — Acceptation d'invitation** `/auth/accept-invitation?token=…`
```
form (mot de passe) → POST /auth/accept-invitation {token,password}
  201 → accessToken + cookie → /dashboard
  401 invalide/expirée → proposer de redemander une invitation
  409 déjà membre → rediriger vers /login
```

**J5 — Requête protégée + refresh transparent**
```
authedFetch(path) :
  Bearer <token mémoire> + credentials:'include'
  401 → refresh SINGLE-FLIGHT (un seul refresh concurrent, coordonné entre onglets)
        ├─ ok  → token mis à jour → REJOUER la requête
        └─ ko  → purge + /login
```

**J6 — Déconnexion**
```
POST /auth/logout (révoque session + efface cookie) → purge token mémoire → /login
```

**J7 — Multi-onglets (piège)**
```
2 onglets expirent ensemble → 2 refresh concurrents → le 2ᵉ présente un token
révoqué → détection de réutilisation → révocation de chaîne → LES DEUX déconnectés.
→ Obligation : un seul onglet rafraîchit (verrou BroadcastChannel / storage event),
  puis diffuse le nouveau token aux autres.
```

### Implications concrètes (checklist)
1. **Token en mémoire** (pas `localStorage`) + restauration via `/auth/refresh` au boot (J1). Si `localStorage` retenu pour simplicité → **CSP stricte obligatoire** (XSS = vol du token).
2. **`authedFetch` unique** : Bearer + `credentials:'include'` + refresh-on-401 **single-flight** + replay.
3. **Coordination multi-onglets** du refresh (J7) — la contrainte la plus facile à rater.
4. **Mapping d'erreurs** : 401→refresh/login · 403→non autorisé · **402→flux activation** · 409→conflit · 429→throttle · 5xx→générique + `traceId`.
5. **Pas de CSRF token** : les mutations sont autorisées par le **header Bearer** ; le cookie refresh est `sameSite=strict` + `path=/api/v1/auth`.
6. **Rôle = UX only** : nav conditionnelle d'après le JWT/`/auth/me`, jamais comme contrôle de sécurité (le backend reste l'autorité, isolation `tenantId`).
7. **Déploiement** : web + API **même site** (sous-domaines) sinon le cookie `sameSite=strict` ne part pas → refresh KO ; **HTTPS** (cookie `secure`) ; origine front **whitelistée** dans `API_CORS_ORIGINS`.
8. **SSE** (statut paiement) : `EventSource` ne porte pas d'`Authorization` — OK car ce flux est **public** ; ne pas concevoir de SSE authentifié.

### Pseudo-code `authedFetch` (single-flight + multi-onglets)
```ts
let accessToken: string | null = null;            // mémoire uniquement
let refreshing: Promise<boolean> | null = null;   // single-flight (par onglet)
const lock = new BroadcastChannel("vp-auth");     // coordination inter-onglets

async function refreshOnce(): Promise<boolean> {
  if (refreshing) return refreshing;              // un seul refresh à la fois
  refreshing = (async () => {
    const r = await fetch(`${API}/auth/refresh`, { method: "POST", credentials: "include" });
    if (!r.ok) { accessToken = null; return false; }
    accessToken = (await r.json()).accessToken;
    lock.postMessage({ type: "token", accessToken }); // diffuse aux autres onglets
    return true;
  })().finally(() => { refreshing = null; });
  return refreshing;
}
lock.onmessage = (e) => { if (e.data?.type === "token") accessToken = e.data.accessToken; };

export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const withAuth = (t: string | null): RequestInit => ({
    ...init, credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}),
               ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
  let res = await fetch(`${API}${path}`, withAuth(accessToken));
  if (res.status === 401) {
    const ok = await refreshOnce();
    if (!ok) { redirectToLogin(); throw new Error("unauthenticated"); }
    res = await fetch(`${API}${path}`, withAuth(accessToken));   // rejoue 1×
  }
  if (!res.ok) throw await toApiError(res);  // { status, message, errors?, traceId }
  return res.json();
}
```

---

## 7. Validations client (miroir des schémas Zod backend)

À répliquer pour un feedback immédiat (le backend reste l'autorité).

| Domaine | Règles |
|--------|--------|
| register | tenantSlug 3–60, displayName 2–120, email, password 8–72 |
| login | tenantSlug 3–60, email, password 8–72 |
| accept-invitation | token ≥ 32, password 8–72 |
| createEvent | slug 3–80, title 3–160, startsAt/endsAt ISO + `endsAt>startsAt`, tagline 2–200, logoUrl URL ≤500, brandColor `#RGB|#RRGGBB`, voteUnitPriceCfa entier 1–10 000 000 |
| createCandidate | fullName 2–160, number entier > 0 (unique/event) |
| castVote | tenantSlug/eventSlug 3–80, candidateNumber entier > 0, amountCfa entier > 0 (=prix unitaire si fixé), voterPhone 8–20 |
| publicPayment init | voteId requis, amountCfa entier > 0, idempotencyKey ≥ 16 |
| publicPayment status | transactionId requis, voterPhone 8–20 |
| createInvitation | email, role ∈ {OWNER, STAFF} |
| saveSecret | key 2–80, value 1–4096 |
| commission/settings | commissionBps 0–10000, activationFeeCfa 0–100 000 000 |
| cancelVote | reason 3–500 |
| listes (admin/votes) | limit 1–100, pagination par `cursor` |

---

## 8. Ordre de construction (phasé)

1. **Socle** : `lib/api.ts` (`apiFetch` + `authedFetch` + refresh + parser d'erreur), `SessionProvider`/garde, layout dashboard, nav par rôle, design tokens + composants de base, pages 404/500/offline, i18n.
2. **Public ADR-016** : `/e/[slug]` (vote + paiement SSE + invariant H1) puis `/e/[slug]/resultats`. Landing `/`.
3. **Auth** : `/login`, `/register`, `/auth/accept-invitation`.
4. **Organisateur core** : `/dashboard`, `/dashboard/events`, `/events/new`, `/events/[id]` (+ branding + **activation 402**), `/candidates`, `/results`.
5. **Compte & équipe** : `/dashboard/settings` (logout, RGPD, secret org), `/dashboard/team`, `/events/[id]/payment`.
6. **Admin léger** : `/dashboard/admin/*` (pagination curseur, scope tenant).
7. **God-mode** : `/dashboard/platform/*` (overview, settings, commissions, votes cancel/delete).
8. **Polish & QA** : états vides/offline partout, a11y WCAG 2.1 AA, i18n complet, E2E Playwright, perf (Lighthouse ≥ 90 sur `/e/[slug]`).

---

**Rappel final** — l'invariant qui prime sur tout : *un vote ne compte qu'une fois payé (`SUCCEEDED`)*. Toute l'UI de vote et de résultats doit le refléter. (Réf. `SECURITY.md` — audit 2026-05-31.)
