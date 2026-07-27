# Audit de stabilisation — SHADOMA Votes

**Date :** 2026-07-09  
**Objectif :** Geler les ajouts de features et corriger les incohérences structurelles (P0) avant toute nouvelle évolution.

---

## Verdict initial

La plateforme était **partiellement assemblée** : mélange admin/organisateur, permissions incomplètes, CRUD hétérogène, maintenance confondue avec la purge, et appels API morts côté vote public.

---

## Matrice des corrections P0 (cette session)

| Problème | État | Action |
|----------|------|--------|
| Pages organisateur dans `/admin` | Corrigé | Retrait `/admin/payments` de la nav ; redirections ; header admin → réglages plateforme |
| RBAC API admin trop permissif | Corrigé | `/admin/*` réservé `PLATFORM_ADMIN` + `PLATFORM_SUPER_ADMIN` |
| `PLATFORM_SUPER_ADMIN` ignoré | Corrigé | Helper `isPlatformOperator` ; rôles alignés maintenance, platform, admin |
| Purge = bouton principal maintenance | Corrigé | Page refondue : **mode maintenance** (toggle) séparé de **purge données** (destructif + confirmation) |
| Vote public cassé (`/privacy/consent`) | Corrigé | Appel retiré du flux ; cast direct |
| Suppressions sans confirmation | Corrigé | `ConfirmDialog` sur évènement, candidat, palier partenaire, purge |
| Purge admin limitée à un tenant | Corrigé | Opérateurs plateforme : purge cross-tenant audit/sessions |

---

## Architecture des espaces (cible)

```text
/admin/*          → Opérateurs plateforme uniquement (AdminRouteGuard)
/dashboard/*      → Organisateurs (OWNER, STAFF) — outils métier tenant
/e/*              → Public (votes, résultats)
```

| Route | Rôle minimal | CRUD |
|-------|--------------|------|
| `/admin/users` | PLATFORM_ADMIN / SUPER | Read (liste) |
| `/admin/settings` | PLATFORM_ADMIN / SUPER | Read / Update |
| `/admin/maintenance` | PLATFORM_ADMIN / SUPER | Mode maintenance + purge + audit |
| `/admin/partners` | PLATFORM_ADMIN / SUPER | Create tiers / Approve / Delete tiers |
| `/dashboard/events/*` | OWNER / STAFF | CRUD évènement & candidats (delete selon règles métier) |
| `/dashboard/team` | Auth (manage = OWNER / opérateurs) | Create invitation / Revoke |

---

## Fonctionnalités — état réel

| Fonctionnalité | Backend | Frontend | Tests | Prod | Statut |
|----------------|---------|----------|-------|------|--------|
| Auth + modals | Oui | Oui | Partiel | Oui | Terminée |
| Vote public + paiement | Oui | Oui (consent fixé) | Partiel | Oui | Partiellement fonctionnelle |
| Dashboard organisateur | Oui | Oui | Partiel | Oui | Terminée |
| Admin plateforme | Oui | Oui (nettoyé) | E2E partiel | Oui | Partiellement fonctionnelle |
| Mode maintenance | **Ajouté** | **Ajouté** | Non | Non | En développement |
| God-mode votes (`/admin/platform/votes`) | Oui | **Non** | Non | Non | Backend seul |
| Vault / Payouts admin | Oui | **Non** | Non | Non | Backend seul |
| Export RGPD compte | Oui | **Non** | Non | Non | Backend seul |
| Utilisateurs (admin) | Oui | **Oui** (rôle + suspension) | Partiel | Non | Partiellement fonctionnelle |

**Règle :** ne pas afficher de bouton/menu tant que la ligne n'est pas au minimum « Partiellement fonctionnelle ».

---

## CRUD — norme cible

Chaque ressource exposée en UI doit proposer, quand le métier le permet :

```text
Voir → Créer → Modifier → Archiver/Supprimer (+ confirmation destructive)
```

| Ressource | Create | Read | Update | Delete | Notes |
|-----------|--------|------|--------|--------|-------|
| Évènement | Oui | Oui | Oui | Oui (archive si votes) | ConfirmDialog |
| Candidat | Oui | Oui | Oui | Oui (bloqué si votes payés) | ConfirmDialog |
| Palier partenaire | Oui | Oui | Partiel | Oui | ConfirmDialog |
| Utilisateur (admin) | Non | Oui | Non | Non | **À faire P1** |
| Feature flags | Oui | Oui | Upsert | Non | **À faire P1** |

---

## Architecture admin réorganisée

```text
Plateforme
  /admin                 Vue d'ensemble
  /admin/users           Utilisateurs (lecture)
  /admin/subscriptions   Revenus
  /admin/partners        Programme partenaire
  /admin/settings        Réglages

Système
  /admin/jobs            Files & jobs
  /admin/feature-flags   Feature flags (+ suppression)
  /admin/maintenance     Mode maintenance uniquement
  /admin/audit           Journal d'audit (+ suppressions + purge)
```

---

## Priorités restantes

### P1 — Refonte & cohérence
- Design system : unifier tables, boutons, états vides/erreur sur toutes les pages admin
- Middleware Next.js : cookie/session hint pour `/admin` (JWT actuellement localStorage uniquement)
- Bannière maintenance sur pages publiques (`GET /maintenance/status`)
- UI god-mode votes, payouts, vault — ou masquer définitivement jusqu'à implémentation

### P2 — Dette & tests
- Tests E2E maintenance mode + purge
- Tests RBAC SUPER_ADMIN
- Documentation OpenAPI à jour
- CRUD admin utilisateurs (changement rôle, suspension)

---

## Fichiers clés modifiés

**API**
- `apps/api/src/auth/platform-roles.ts`
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/maintenance/*`
- `apps/api/src/platform-control/platform-control.controller.ts`

**Web**
- `apps/web/app/admin/maintenance/page.tsx`
- `apps/web/components/admin-sidebar.tsx`
- `apps/web/components/admin-header.tsx`
- `apps/web/app/e/[slug]/use-public-vote-payment.ts`
- `apps/web/lib/platform-maintenance.ts`
- `apps/web/lib/roles.ts`

---

## Prochaine étape recommandée

1. Déployer API + web avec ces corrections  
2. Tester manuellement : login admin → maintenance toggle → purge avec confirmation → vote public  
3. Traiter P1 (bannière maintenance publique + masquer features backend-only)
