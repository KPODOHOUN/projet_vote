# Bêta dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une bêta organisateur Escrow sans mensonge « abonnement requis », ChatWidget hors espaces de travail, page unique « Mon offre », React Query sur offre + wallet — sans toucher aux paiements votants.

**Architecture:** Composition d’endpoints existants (`GET /organizer/offer`, `GET /subscriptions/me`, `GET /organizer/wallet`). Aucun changement Nest. Redirect frontend `/dashboard/subscription` → `/dashboard/offer`. ChatWidget filtré par `usePathname`.

**Tech Stack:** Next.js 15 App Router, TanStack Query (déjà provider racine), `authedFetch`, i18n `lib/i18n.ts` + `useI18n().t`.

## Global Constraints

- Aucun payload / endpoint vote, tickets publics, login, register modifié.
- Aucun fichier sous `apps/web/app/e/` sauf si ChatWidget (layout racine) est le seul impact.
- `AccountPlanGuard` non réactivé ; gate événements = `offerType` côté API (déjà en place).
- Lint web : 0 erreur nouvelle ; warnings préexistants OK.
- Typecheck web : exit 0.
- Aucun commit git sauf demande explicite de l’utilisateur.
- Aucune fake data / placeholder.

## File map

| Fichier | Rôle |
|---|---|
| `apps/web/components/chat-widget.tsx` | Allowlist pathname |
| `apps/web/lib/hooks/use-organizer-offer.ts` | `useOrganizerOffer` |
| `apps/web/lib/hooks/use-organizer-wallet.ts` | wallet + withdrawals queries + mutation |
| `apps/web/app/dashboard/layout.tsx` | Bannière vérité produit |
| `apps/web/app/dashboard/page.tsx` | Plus de `subscriptionBlocked` Escrow |
| `apps/web/app/dashboard/offer/page.tsx` | Page fusionnée |
| `apps/web/app/dashboard/subscription/page.tsx` | Redirect |
| `apps/web/components/dashboard-sidebar.tsx` | Retirer item Abonnement |
| `apps/web/app/dashboard/wallet/page.tsx` | Consommer hooks RQ |
| `apps/web/lib/i18n.ts` | Clés `offer.*` + copy bannière |
| `apps/web/components/dashboard-header.tsx` | LanguageSwitcher |
| `apps/web/components/app-header.tsx` | Label lien `/vote` |

---

### Task 1: ChatWidget — allowlist

**Files:**
- Modify: `apps/web/components/chat-widget.tsx`

**Interfaces:**
- Consumes: `usePathname` from `next/navigation`
- Produces: widget rendu ssi `/`, `/e/*`, `/vote*`

- [ ] **Step 1:** Ajouter le filtre en tête du composant, avant tout JSX :

```tsx
import { usePathname } from "next/navigation";

export function ChatWidget() {
  const pathname = usePathname() ?? "";
  const allowed =
    pathname === "/" || pathname.startsWith("/e/") || pathname.startsWith("/vote");
  // ... existing state ...
  if (!allowed) return null;
```

Ne pas changer l’appel API chat ni le markup du bouton.

- [ ] **Step 2:** Vérifier qu’aucun import cassé. `npm --prefix apps/web run typecheck` attendu exit 0 (ou `npx tsc --noEmit` dans `apps/web`).

---

### Task 2: Hooks `useOrganizerOffer` + wallet

**Files:**
- Create: `apps/web/lib/hooks/use-organizer-offer.ts`
- Create: `apps/web/lib/hooks/use-organizer-wallet.ts`

**Interfaces:**
- Consumes: `authedFetch`, `getStoredToken`, `useQuery` / `useMutation` / `useQueryClient` (même pattern que `use-organizer-events.ts`)
- Produces:

```ts
export type OrganizerOffer = {
  offerType: "EXTERNAL" | "ESCROW";
  provider: "FEDAPAY" | "FEEXPAY" | "KKIAPAY" | null;
  fedapaySubAccount: {
    reference: string | null;
    submittedAt: string | null;
    verifiedAt: string | null;
    ready: boolean;
  };
};

export function useOrganizerOffer(enabled: boolean) // queryKey ["organizer", "offer"]
  // GET /organizer/offer, staleTime: 30_000, enabled: enabled && Boolean(getStoredToken())

export type OrganizerWallet = {
  id: string;
  tenantId: string;
  availableCfa: number;
  pendingCfa: number;
  updatedAt: string;
  recentEntries: Array<{
    id: string;
    kind: string;
    amountCfa: number;
    createdAt: string;
    note: string | null;
  }>;
};

export type OrganizerWithdrawal = {
  id: string;
  amountCfa: number;
  status: string;
  createdAt: string;
  rejectReason: string | null;
};

export function useOrganizerWallet(enabled: boolean) // queryKey ["organizer", "wallet"] GET /organizer/wallet
export function useOrganizerWithdrawals(enabled: boolean) // queryKey ["organizer", "withdrawals"] GET /organizer/withdrawals
export function useRequestWithdrawal() // POST /organizer/withdrawals { amountCfa: number }, onSuccess invalidate both keys
```

- [ ] **Step 1:** Créer les deux fichiers en copiant le style de `apps/web/lib/hooks/use-subscription.ts` (enabled + getStoredToken + staleTime 30_000).

- [ ] **Step 2:** Mutation :

```ts
export function useRequestWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amountCfa: number) =>
      authedFetch("/organizer/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amountCfa })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organizer", "wallet"] });
      await queryClient.invalidateQueries({ queryKey: ["organizer", "withdrawals"] });
    }
  });
}
```

Payload POST **strictement** `{ amountCfa }` — identique à `wallet/page.tsx` actuel.

- [ ] **Step 3:** `npx tsc --noEmit` dans `apps/web` → exit 0.

---

### Task 3: Vérité produit — bannières

**Files:**
- Modify: `apps/web/app/dashboard/layout.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/lib/i18n.ts` (clés `dash.banner.subMissing*` — ne plus dire que la création est suspendue ; les clés restent pour EXTERNAL/legacy si un plan expire)

**Interfaces:**
- Consumes: `useOrganizerOffer`, `useSubscriptionUsage` (existant)
- Produces: Escrow sans bannière bloquante

- [ ] **Step 1 — layout `SubscriptionBanner`:** Remplacer le `useEffect`+`apiFetch` par :

```tsx
const offerQuery = useOrganizerOffer(true);
const usageQuery = useSubscriptionUsage(true);
if (offerQuery.isPending || usageQuery.isPending) return null;
const offerType = offerQuery.data?.offerType;
if (offerType === "ESCROW") {
  const days = usageQuery.data?.daysRemaining;
  if (usageQuery.data?.hasSubscription && days != null && days <= 7) {
    // bannière warning expiration existante, lien href="/dashboard/offer"
  }
  return null; // JAMAIS le bandeau destructive « Aucun abonnement »
}
// EXTERNAL ou inconnu : ne pas afficher le bandeau destructive non plus
// (le gate API n'est plus l'abonnement). Expiration seulement si hasSubscription && days <= 7.
```

Supprimer le texte FR en dur. Utiliser `useI18n().t`.

- [ ] **Step 2 — `dashboard/page.tsx`:** Après `useOrganizerOffer(hasToken)` :

```tsx
const offerQuery = useOrganizerOffer(hasToken);
const isEscrow = offerQuery.data?.offerType === "ESCROW";
const subscriptionBlocked =
  !isEscrow &&
  Boolean(usage) &&
  (usage!.hasSubscription === false ||
    (usage!.eventsLimit != null && usage!.eventsUsed >= usage!.eventsLimit));
```

Changer `Link href="/dashboard/subscription"` → `href="/dashboard/offer"`.

Pour Escrow, `subscriptionBlocked` est false même si `hasSubscription === false`.

- [ ] **Step 3:** Corriger FR/EN `dash.banner.subMissingDesc` pour ne plus affirmer une suspension (au cas où EXTERNAL afficherait encore la bannière via limite plan). Ex. FR : « Votre formule héritée n’est plus active. L’offre Escrow reste disponible. »

- [ ] **Step 4:** typecheck web exit 0.

---

### Task 4: Fusion page Offre + redirect + sidebar

**Files:**
- Modify: `apps/web/app/dashboard/offer/page.tsx`
- Modify: `apps/web/app/dashboard/subscription/page.tsx` (redirect only)
- Modify: `apps/web/components/dashboard-sidebar.tsx` (retirer l’item `nav.subscription`)
- Modify: `apps/web/app/dashboard/subscription/subscribe/page.tsx` (redirect succès → `/dashboard/offer`)
- Modify: `apps/web/app/dashboard/subscription/partner/page.tsx` (idem liens retour)
- Modify: `apps/web/lib/i18n.ts` (clés `offer.*`)

**Interfaces:**
- Consumes: `useOrganizerOffer`, `useSubscriptionUsage`, éventuellement `authedFetch` `/subscriptions/me` via un petit `useSubscriptionMe` **seulement si** usage ne contient pas planType/expiresAt suffisants. Si `useSubscriptionUsage` a `hasSubscription`, `planName`, `expiresAt`, `daysRemaining`, `commissionRate` — s’en servir et **ne pas** recréer le fetch `useEffect` de l’ancienne page subscription.
- Produces: une page, un item nav

- [ ] **Step 1:** Clés i18n FR+EN (parité exacte), au minimum :

```
offer.kicker, offer.title, offer.activeLabel, offer.escrowTitle, offer.escrowDesc,
offer.openWallet, offer.externalTitle, offer.externalDesc, offer.loadError,
offer.planActiveTitle, offer.expiresIn
```

- [ ] **Step 2:** Réécrire `offer/page.tsx` en client : LoadingState / FormError / Card DS. Structure :
  1. Header + `offerType`
  2. Carte Escrow **ou** carte External (logique visuelle actuelle conservée)
  3. Si `usage.hasSubscription` : Card compacte planName / daysRemaining / commission — **sans** boutons Souscrire / Partenaire
  4. CTA wallet uniquement pour ESCROW

- [ ] **Step 3:** `subscription/page.tsx` devenir :

```tsx
import { redirect } from "next/navigation";
export default function DashboardSubscriptionRedirect() {
  redirect("/dashboard/offer");
}
```

(Page serveur, plus de client fetch.)

- [ ] **Step 4:** Sidebar : supprimer la ligne `{ href: "/dashboard/subscription", ... }`. Import `IdCard` si devenu inutilisé → retirer.

- [ ] **Step 5:** `subscribe/page.tsx` et `partner/page.tsx` : `router.push("/dashboard/offer")` et liens « retour » vers `/dashboard/offer`. **Ne pas** supprimer ces routes.

- [ ] **Step 6:** typecheck + eslint des fichiers touchés exit 0.

---

### Task 5: Wallet React Query

**Files:**
- Modify: `apps/web/app/dashboard/wallet/page.tsx`

**Interfaces:**
- Consumes: `useOrganizerWallet`, `useOrganizerWithdrawals`, `useRequestWithdrawal`
- Produces: même UI, même POST `{ amountCfa }`

- [ ] **Step 1:** Remplacer `useState`/`useEffect` `load` par les trois hooks. `onWithdraw` appelle `mutateAsync(amountCfa)` au lieu de `authedFetch` + `load()`.

- [ ] **Step 2:** Erreurs → `FormError`. Loading → `LoadingState` existant. **Ne pas** changer les montants ni le formulaire.

- [ ] **Step 3:** GlassCard peut rester (hors scope unification Card). typecheck exit 0.

---

### Task 6: LanguageSwitcher dashboard + label Home `/vote`

**Files:**
- Modify: `apps/web/components/dashboard-header.tsx`
- Modify: `apps/web/components/app-header.tsx`
- Modify: `apps/web/lib/i18n.ts` si besoin `nav.accessEvent`

- [ ] **Step 1:** Dans le header dashboard, à côté de la search/cloche, rendre `<LanguageSwitcher />` (variant `default`).

- [ ] **Step 2:** Dans `sectionLinks`, remplacer `{ key: "billetterie", fr: "Billetterie", en: "Ticketing" }` par `{ key: "billetterie", fr: "Accéder à un évènement", en: "Access an event" }`. **Garder** `href ... "/vote"` (inchangé).

- [ ] **Step 3:** typecheck exit 0.

---

### Task 7: Gates bêta

**Files:** aucun nouveau, vérif seulement.

- [ ] **Step 1:** `cd apps/web && npx tsc --noEmit` → exit 0
- [ ] **Step 2:** `cd apps/web && npm run lint` → 0 erreur
- [ ] **Step 3:** `rg "Vous ne pouvez plus créer de concours" apps/web` → 0 match
- [ ] **Step 4:** `rg "href=\\\"/dashboard/subscription\\\"" apps/web/app/dashboard/page.tsx apps/web/app/dashboard/layout.tsx apps/web/components/dashboard-sidebar.tsx` → 0 match (subscribe/partner peuvent encore se lier entre eux)
- [ ] **Step 5:** `cd apps/web && npm run test:e2e` → 19 passed (flaky retry OK). Si une spec cible la sidebar Abonnement, la pointer vers Mon offre.

---

## Spec coverage

| Spec § | Task |
|---|---|
| 4.1 Bannières | 3 |
| 4.2 Page unique + redirect + nav | 4 |
| 4.3 ChatWidget | 1 |
| 4.4 RQ offer + wallet | 2, 5 |
| 4.5 i18n + switcher + label Home | 3, 4, 6 |
| 4.6 Loading sans flash | 3 (return null pending) |
| 5 Non-régression e2e | 7 |
