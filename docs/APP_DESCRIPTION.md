# SHADOMA Votes — Description claire de l'application

> Dernière mise à jour : 2026-07-04 · aligné sur **ADR-016** et parcours votant sécurisé (`publicRef`).

## En une phrase
**SHADOMA Votes est une plateforme SaaS multi-tenant de concours à votes payants** (par mobile money) pour le Bénin et l'Afrique francophone : une application unique et mutualisée où chaque organisateur dispose d'un **compte isolé** (son « locataire »), et où **chaque concours devient une plateforme publique à part entière** (sa propre URL, son branding, ses règles de vote et son revenu).

---

## 1. Le principe (multi-tenant)

Une **seule** application tourne (front + API + base de données partagée). Quand un organisateur s'inscrit, il ne reçoit pas une nouvelle app déployée à part, mais un **espace logiquement cloisonné à l'intérieur de l'application** — un *tenant*. C'est le même modèle que **Shopify/Chariow** (une plateforme, plein de boutiques) : chaque organisateur a ses comptes, ses concours et son chiffre d'affaires, mais tout repose sur l'infrastructure commune de SHADOMA Votes.

> *« Créer un concours »* = créer un **Event** dans son compte. L'Event obtient instantanément une **page publique dédiée** et un suivi isolé — **sans aucun déploiement ni code supplémentaire**.

---

## 2. Le pivot « event-as-platform » (ADR-016)

| Axe | Avant | Maintenant |
|-----|-------|------------|
| **Unité publique** | l'organisateur | **l'événement** (identité/URL/branding propres) |
| **URL publique** | `/vote/{tenantSlug}/{eventSlug}` | **`/e/{eventSlug}`** (slug d'événement **globalement unique**) |
| **Lien candidat** | numéro séquentiel | **`/e/{eventSlug}/c/{publicRef}`** — ref aléatoire (~128 bits), numéro d'affichage optionnel |
| **Organisateur** | la « plateforme » | un **compte** qui agrège ses événements |
| **Frontière de sécurité** | `tenantId` | **inchangée : `tenantId`** |
| **Config (branding, FeexPay, règles)** | niveau organisateur | **par événement**, hérité par défaut |

Les anciennes URLs `/vote/...` redirigent vers `/e/{slug}`. L'API accepte encore `candidateNumber` en fallback ; le front partage des liens basés sur `publicRef`.

---

## 3. Les trois acteurs

| Acteur | Rôle technique (`UserRole`) | Ce qu'il fait |
|--------|------------------------------|---------------|
| **Admin plateforme** | `PLATFORM_ADMIN` | God-mode `/admin/platform/*` : supervise tous les tenants, commissions, contrats, retraits, audit, maintenance |
| **Organisateur** | `ORGANIZER_OWNER` / `ORGANIZER_STAFF` | Gère SES événements et candidats ; consulte SES votes et revenus ; invite des membres |
| **Votant** | public, anonyme | Vote en payant ; identifié par son téléphone (haché) |

---

## 4. Le parcours type

```
Organisateur (compte = Tenant)
  └── crée un Event (concours)              → page publique /e/{slug}
        ├── configure branding, prix du vote, billetterie
        ├── ajoute des Candidates (publicRef auto, numéro optionnel)
        └── lit et signe le contrat du concours → statut ACTIVE (en ligne)
                    └── le public vote        → paiement Mobile Money (XOF) sur le compte SHADOMA
                          └── webhook + verify-by-pull → vote validé
                                └── commission (12 % par défaut) → reste au portefeuille organisateur
```

**Partage votant :** lien direct par candidat (`/e/{slug}/c/{publicRef}`), copiable depuis le dashboard organisateur.

---

## 5. Modèle économique

- **Votes et billets payants** : micro-paiements mobile money (FeexPay / FedaPay, FCFA/XOF) encaissés par SHADOMA.
- **Commission** : 12 % par défaut, prélevée à chaque paiement confirmé ; taux négocié possible par organisateur (date d'effet, historisé, jamais rétroactif) ; le taux d'un concours est figé par son contrat.
- **Portefeuille organisateur** : part réservée (libérée 48 h après la clôture) + part retirable ; retraits validés par un admin.
- **Aucun abonnement, aucun frais d'activation** : la mise en ligne passe uniquement par la signature du contrat (ADR-022).

---

## 6. Architecture technique

**Monorepo** (npm workspaces) :
- **`apps/web`** — Next.js 15 (App Router) : pages publiques `/e/...` + dashboards
- **`apps/api`** — NestJS 11 : métier, sécurité, webhooks, contrats
- **`packages/db`** — Prisma + PostgreSQL (scoping `tenantId`)
- **`packages/shared`** — types/contrats

**Déploiement cible :** Cloudflare Pages (web) · Google Cloud Run (API) · Neon PostgreSQL · Upstash Redis · Cloudflare R2.

**CI/CD (GitHub Actions) :**
- `CI` — typecheck, build, tests API (165 tests)
- `E2E` — Playwright (14 scénarios, Chromium)
- `Deploy API (Cloud Run)` · `Deploy Web (Cloudflare Pages Hook)` · `Deploy Maintenance Cron Worker`
- `Ops Healthchecks` — toutes les 5 minutes

Les migrations Prisma s'appliquent au démarrage du conteneur API (`docker-entrypoint.api.sh`) et manuellement via `npm run db:migrate:deploy`.

---

## 7. Fonctionnalités clés

- **Multi-tenant** : isolation stricte par `tenantId`
- **Auth & sécurité** : JWT access/refresh, RBAC, lockout brute-force, throttling (Redis optionnel)
- **Paiements** : FeexPay (+ abstraction multi-PSP), verify-by-pull, idempotence
- **Parcours votant** : pages publiques SSR, résultats en direct, liens candidat sécurisés
- **Conformité RGPD** : export ZIP, suppression/anonymisation, consentement cookies
- **Observabilité** : logs JSON, `x-trace-id`, Sentry, `/ops/metrics`, healthchecks
- **Admin plateforme** : audit, jobs, règles d'argent, taux négociés, contrats signés, retraits, secrets plateforme

---

## 8. État actuel (2026-07-04)

- **API** : 165 tests verts sur PostgreSQL réel.
- **Front** : routes publiques `/e/{slug}`, profils `/e/{slug}/c/{ref}`, quick-start organisateur, programme partenaires.
- **E2E** : 14/14 Playwright verts en local.
- **CI** : workflows `ci.yml` + `e2e.yml` prêts ; workflows deploy + ops healthchecks ajoutés.
- **Prod** : appliquer les migrations récentes (`publicRef`, partenaires, secrets plateforme) — automatique au redeploy API si entrypoint actif ; smoke test via `scripts/smoke-deploy.sh`.

---

**En résumé :** SHADOMA Votes permet à un organisateur africain de lancer un concours de vote payant en quelques clics, avec une page publique par concours, des liens candidat partageables et une infrastructure mutualisée sécurisée.
