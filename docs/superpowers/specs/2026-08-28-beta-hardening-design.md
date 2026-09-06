# Bêta SHADOMA Votes — Design de durcissement global

**Date :** 2026-08-28  
**Statut :** Approuvé (utilisateur : « Allons-y », scope « tout »)  
**Objectif :** Corriger l’ensemble des problèmes UX/techniques identifiés pour une **version bêta Escrow-only** exploitable, **sans casser** le funnel vote ni les contrats API.

---

## 1. Contexte

- **Phases livrées :** A (fondations DS), B (zone publique `/e/*`), modales auth M1–M5, e2e 19/19.
- **Produit actif :** `TenantOfferType.ESCROW` seul ; `offer1_external_enabled=false` ; paiements démo.
- **Dette restante :** i18n inline (~1 250 `isEn ?`), React Query marginal (~6 fichiers), Home hors redesign, auth fragmentée, admin legacy visible, ChatWidget global.

## 2. Principes

1. **Vagues séquentielles** avec gate : `tsc` 0, lint web 0 err, e2e 19/19.
2. **Zones sanctuarisées :** payloads vote/paiement, webhooks, `/e/*` funnel — revue diff obligatoire.
3. **Masquer, pas supprimer** le legacy (routes admin, code subscription) jusqu’à post-bêta.
4. **Home + globals.css :** ajouter des tokens, ne pas renommer `.vp-*` utilisés par la Home (P0-4).
5. **Pas de commit automatique** sauf demande explicite.

## 3. Programme en 6 vagues

| Vague | Contenu | Gate principale |
|-------|---------|-----------------|
| **0** | Clarté Escrow, ChatWidget scopé, LanguageSwitcher dashboard/admin, legacy admin replié, Home sans lien Admin | e2e 19/19 |
| **1** | Auth unifiée (OTP, reset, invitation, OAuth) | e2e account, invitations, auth-otp |
| **2** | Dashboard : React Query, i18n `dash.*`, decision-first, GlassCard → Card | e2e organizer-flow, wallet flows |
| **3** | Admin : React Query, i18n `admin.*`, DataTable responsive | e2e admin-* |
| **4** | Home : i18n `home.*`, header `lg`, messaging Escrow | e2e legacy-vote + smoke visuel |
| **5** | Finitions : sweep i18n, retrait `dark:` résiduels, checklist bêta 12 parcours | rapport qualité ≥ 8/10 |

## 4. Vague 0 — détail

### 4.1 ChatWidget
- Afficher uniquement sur : `/`, `/e/*`, `/vote`, `/vote/*`, `/pricing`, pages légales publiques.
- Masquer sur : `/dashboard/*`, `/admin/*`, auth (`check-email`, `verify-email`, `forgot-password`, `reset-password`, `accept-invitation`, `oauth/*`).

### 4.2 Navigation produit
- Dashboard sidebar : **pas** d’entrée « Abonnement » (déjà retirée) ; conserver « Mon offre » + wallet.
- Bannières layout : Escrow ne bloque pas sur abonnement (déjà en place) ; i18n bannière démo.
- Admin sidebar : section « Hérité » **repliée par défaut**, badge « Déprécié ».

### 4.3 i18n chrome
- `LanguageSwitcher` dans `dashboard-header` et `admin-header`.

### 4.4 Home
- Retirer lien **Admin** du header marketing (desktop + mobile).
- Conserver `/vote` comme entrée « code événement » pour Billetterie (parcours existant).

## 5. Hors scope bêta immédiat

- Suppression code subscription/backend.
- Refonte complète ticket designer (mobile simplifié en vague 2).
- Split CSS Home vs app (ADR future, pas vague 4).

## 6. Critères de succès bêta

Un organisateur Escrow peut : s’inscrire → créer un event → recevoir des votes démo → voir wallet → demander retrait — **sans** message « abonnement requis ».  
Un votant peut voter sur mobile en < 2 min.  
Un admin peut valider un retrait.  
e2e 19/19 vert sur chaque vague.
