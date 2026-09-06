# Bêta dashboard — vérité produit Escrow (hors Home marketing)

**Date :** 2026-08-28  
**Statut :** Approuvé (barème « bêta + dashboard », fusion Offre/Abonnement, exécution séquentielle A)  
**Périmètre :** dashboard organisateur + chrome global (ChatWidget, liens d’entrée)  
**Hors périmètre :** refonte visuelle Home, i18n big bang (~1250 `isEn ?`), React Query sur les 29 pages, admin, funnel vote `/e/*`, contrats API paiement

---

## 1. Objectif

Une version **bêta** où un organisateur Escrow peut créer un concours, encaisser (démo) et retirer **sans être menti** par l’UI d’abonnement, sans casser le funnel votant.

## 2. Constat (preuve)

Le backend autorise la création d’événements via `Tenant.offerType` + flags plateforme (`events.service.ts` `assertOfferAllowsEventCreation`). `AccountPlanGuard` n’est plus branché sur ces routes.

Le frontend ment encore :

- `dashboard/layout.tsx` : bannière « Aucun abonnement actif. Vous ne pouvez plus créer de concours… »
- `dashboard/page.tsx` : `subscriptionBlocked` si `usage.hasSubscription === false`
- Sidebar : **Mon offre** + **Abonnement**
- Clés i18n `dash.banner.subMissing*` : « création d’évènements … suspendues »

## 3. Décisions actées

| Décision | Choix |
|---|---|
| Barème | Bêta sûre **+** dashboard orga (pas tout le diagnostic) |
| Offre vs Abonnement | **Une page** `/dashboard/offer` ; `/dashboard/subscription` **redirige** vers `/offer` ; bloc abonnement **seulement si un plan est actif** |
| ChatWidget | Visible **Home + `/e/*` + `/vote`** seulement |
| Paiements | **Zéro** changement de payload / endpoint vote, tickets, wallet, withdrawals |
| Commits | Aucun pendant la phase sauf demande explicite |

## 4. Comportement cible

### 4.1 Vérité produit (bannières)

- Tenant **ESCROW** (cas bêta) : **aucune** bannière bloquante « abonnement requis ». La création d’événements n’est pas présentée comme suspendue.
- Si un abonnement **existe** et `daysRemaining <= 7` : bannière d’**expiration** (info), lien vers `/dashboard/offer` (plus `/subscription`).
- Tenant **EXTERNAL** (offre en réflexion) : conserver le message « External indisponible / basculer Escrow » déjà présent sur `/dashboard/offer`. Ne pas inventer un gate abonnement.

`subscriptionBlocked` sur le home dashboard : pour Escrow, **toujours false** (sauf limite plan si un plan actif a vraiment `eventsLimit` — rare en bêta Escrow ; si `hasSubscription === false`, ne pas bloquer).

### 4.2 Page unique « Mon offre »

`GET /organizer/offer` + `GET /subscriptions/me` (existants, composition UI).

Toujours afficher :

- Type d’offre (Escrow / External)
- Copy Escrow actuelle (portefeuille, retenue, démo)
- CTA « Ouvrir mon portefeuille »

Si `subscriptions/me.current` est non null : bloc compact (plan, expiration, commission) **sans** CTA « Souscrire » comme prérequis. Lien optionnel vers `/dashboard/subscription/subscribe` seulement si `current` est null **et** l’utilisateur ouvre un disclosure « Formules héritées » — **non** : décision actée = montrer l’abonnement **seulement s’il est actif**. Donc **pas** de CTA souscrire sur cette page en bêta.

`/dashboard/subscription/page.tsx` : `redirect("/dashboard/offer")` (Next `redirect` ou `router.replace` côté client). Pages `/subscribe` et `/partner` **conservées** (deep-links, admin, tests). Après succès subscribe : rediriger vers `/dashboard/offer`.

Sidebar : retirer l’item Abonnement. Liens `href="/dashboard/subscription"` du home dashboard → `/dashboard/offer`.

### 4.3 ChatWidget

`usePathname()` : rendre le widget ssi `pathname === "/"` ou `pathname.startsWith("/e/")` ou `pathname.startsWith("/vote")`. Ailleurs : `return null`.

### 4.4 React Query ciblé

- Hook `useOrganizerOffer(enabled)` → `GET /organizer/offer` (pour bannière layout + page offre).
- Hook `useOrganizerWallet(enabled)` → `GET /organizer/wallet` + `GET /organizer/withdrawals` (queryKeys distinctes).
- Page wallet : consommer ces hooks ; **mutation** retrait = même `POST` qu’aujourd’hui, `invalidateQueries` ensuite.
- Home dashboard : déjà sur `useOrganizerEvents` ; y brancher `useOrganizerOffer` pour le flag Escrow.

Pas de migration RQ des autres pages.

### 4.5 i18n (surfaces touchées seulement)

- Bannières layout + dash : clés existantes `dash.banner.*` **corrigées** (Escrow n’est plus « suspendu ») + clés `offer.*` pour la page fusionnée.
- `LanguageSwitcher` dans `dashboard-header.tsx` (même composant que Home).
- Header Home : le lien qui va vers `/vote` s’intitule **« Accéder à un évènement »** / EN équivalent — URL `/vote` inchangée (page de saisie de code).

### 4.6 Loading / erreur

Surfaces touchées : `LoadingState` + `FormError` (plus de `Card` destructive ad-hoc sur offer). Layout banner : ne rien montrer pendant le chargement offer/subscription (pas de flash « aucun abonnement »).

## 5. Non-régression

- Funnel `/e/*` : aucun fichier vote/paiement public modifié sauf ChatWidget (pathname).
- E2E `apps/web` : **19/19** après la dernière tranche. Specs qui cliquent « Abonnement » dans la sidebar : les mettre à jour vers « Mon offre » / `/dashboard/offer` si elles cassent.
- Typecheck web 0 erreur ; lint web 0 erreur (warnings préexistants OK).

## 6. Risques

| Risque | Mitigation |
|---|---|
| Un tenant EXTERNAL sans Escrow perd le CTA subscribe | Accepté en bêta : External est « en réflexion » ; subscribe URLs restent |
| Redirect casse un bookmark / e2e | Redirect explicite ; specs mises à jour |
| Bannière layout refetch à chaque page | `staleTime` 30s sur `useOrganizerOffer` + `useSubscriptionUsage` (déjà 30s) |
