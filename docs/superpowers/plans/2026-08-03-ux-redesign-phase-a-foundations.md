# Phase A — Fondations UX : tokens, primitives unifiées, React Query

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réparer les fondations du design system (conteneur cassé, doublons de composants, états hétérogènes, React Query inutilisé) **sans aucun changement visuel visible**, pour débloquer les phases B–E (zones votante, auth, dashboard, admin).

**Architecture:** Ajustements additifs uniquement dans `apps/web` : corrections ciblées dans `globals.css`, évolution des primitives vendored shadcn (`components/ui/*`), nouveaux hooks `lib/hooks/*` wrappant `authedFetch`, et migration d'une page pilote (`app/dashboard/page.tsx`) comme preuve du pattern.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4 (`@theme` CSS-first), shadcn/ui new-york, Radix (`radix-ui`), TanStack React Query v5, Sonner, lucide-react, TypeScript strict.

**Spec de référence:** `docs/superpowers/specs/2026-08-03-ux-redesign-strategy-design.md` (décisions D1/D2/D3 actées le 2026-08-03).

## Global Constraints

- **HOME FROZEN** : `app/page.tsx` et tout fichier qui y est importé ne sont **jamais modifiés**. Aucun changement ne doit altérer le rendu de `/` (règle §5.8 de la spec : on ajoute, on ne casse pas).
- **Aucun changement visuel intentionnel** dans cette phase, sauf : contenu dashboard/admin cappé à 1440 px (fix P0-1) et boutons shadcn à 44 px min (fix tactile). Tout autre diff visuel est une régression.
- **Zéro modification d'API/contrat backend.** Toutes les données viennent des endpoints existants via `authedFetch`/`apiFetch` (`apps/web/lib/api.ts`).
- **Le mécanisme dark mode reste en place et inerte** (`@custom-variant dark` + bloc `[data-theme="dark"]` dans `globals.css`). On retire uniquement les classes `dark:` des fichiers listés (inertes aujourd'hui, retrait = zéro effet visuel).
- **Couleurs de statut : tokens sémantiques uniquement** (`--color-success`, `--color-warning`, `--color-error`, `--color-info`, `*-text`) — plus de `emerald/amber/sky/red` Tailwind bruts dans les fichiers touchés.
- **TypeScript strict, zéro `any`.** Gates par tâche : `npm run typecheck` puis `npm run lint` dans `apps/web` ; build + revue visuelle Home en fin de phase.
- **Commits** : un commit par tâche, uniquement après accord explicite de l'utilisateur (convention du repo).
- **i18n** : toute string FR/EN nouvelle passe par les clés de `apps/web/lib/i18n.ts` (dictionnaires `fr` puis `en`), jamais de ternaire `isEn ? … : …` dans les fichiers touchés.

---

### Task 1 : Fix du token conteneur (P0-1)

**Files:**
- Modify: `apps/web/app/dashboard/layout.tsx:90`
- Modify: `apps/web/app/admin/layout.tsx:35`

**Interfaces:**
- Consumes: classes Tailwind v4 existantes `max-w-container-wide` (1440 px, définie dans `globals.css` via `--max-width-container-wide`).
- Produces: contenu dashboard/admin cappé à 1440 px centré. Aucun symbole exporté.

La classe `max-w-container-max` n'existe pas dans `@theme` (seuls `--max-width-container`, `-wide`, `-narrow` sont définis) → elle est noop et le contenu s'étale. On la remplace par la classe réelle la plus proche de l'intention (admin/dashboard = écrans larges → `wide` = 1440 px).

- [ ] **Step 1: Remplacer dans `apps/web/app/dashboard/layout.tsx` (ligne 90)**

```tsx
// AVANT
<div className="mx-auto max-w-container-max p-6 md:p-10 lg:p-12">{children}</div>
// APRÈS
<div className="mx-auto max-w-container-wide p-6 md:p-10 lg:p-12">{children}</div>
```

- [ ] **Step 2: Remplacer dans `apps/web/app/admin/layout.tsx` (ligne 35)**

```tsx
// AVANT
<div className="mx-auto max-w-container-max p-8 md:p-12 lg:p-16">{children}</div>
// APRÈS
<div className="mx-auto max-w-container-wide p-8 md:p-12 lg:p-16">{children}</div>
```

- [ ] **Step 3: Vérifier qu'il ne reste aucune occurrence**

Run: `rg "max-w-container-max" apps/web` → attendu : 0 résultat.
Run: `cd apps/web && npm run typecheck` → attendu : 0 erreur.

- [ ] **Step 4: Checkpoint visuel (dev server)** : `/dashboard` et `/admin` présentent un contenu centré cappé à 1440 px sur écran large. Commit après accord utilisateur.

---

### Task 2 : Light-only — retrait des classes `dark:` des primitives + `next-themes` (D1)

**Files:**
- Modify: `apps/web/components/ui/button.tsx`
- Modify: `apps/web/components/ui/badge.tsx`
- Modify: `apps/web/components/ui/input.tsx`
- Modify: `apps/web/components/ui/checkbox.tsx`
- Modify: `apps/web/components/ui/select.tsx`
- Modify: `apps/web/components/ui/sonner.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: rien (composants de base).
- Produces: mêmes exports (`Button`, `Badge`, `Input`, `Checkbox`, `Select*`, `Toaster`) avec mêmes signatures. Rendu strictement identique (les classes retirées sont inertes : aucun `data-theme="dark"` n'est jamais posé).

Ces classes `dark:` sont mortes (mécanisme jamais activé) ; leur retrait allège le CSS et acte le light-only. Le mécanisme dark dans `globals.css` n'est PAS touché (voir Global Constraints).

- [ ] **Step 1: `button.tsx` — retirer les 4 fragments dark dans `buttonVariants`**

```tsx
// Ligne de base cva : retirer " dark:aria-invalid:ring-destructive/40"
// variant destructive : retirer " dark:bg-destructive/60 dark:focus-visible:ring-destructive/40"
// variant outline : retirer " dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
// variant ghost : retirer " dark:hover:bg-accent/50"
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // sizes inchangés
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

- [ ] **Step 2: `badge.tsx`** — retirer ` dark:aria-invalid:ring-destructive/40` de la base et ` dark:bg-destructive/60 dark:focus-visible:ring-destructive/40` du variant `destructive` (même mécanique qu'au Step 1, autres classes inchangées).

- [ ] **Step 3: `input.tsx`** — retirer ` dark:bg-input/30` (fin du premier groupe de classes) et ` dark:aria-invalid:ring-destructive/40`.

- [ ] **Step 4: `checkbox.tsx`** — retirer ` dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary` en fin de la classe du `CheckboxPrimitive.Root`.

- [ ] **Step 5: `select.tsx`** — retirer ` dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40` dans `SelectTrigger`.

- [ ] **Step 6: `sonner.tsx` — thème light fixe, retrait de `next-themes`**

```tsx
"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Thème fixe "light" : l'app est light-only (décision D1, spec 2026-08-03).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
```

- [ ] **Step 7: `package.json`** — supprimer la ligne `"next-themes": "^0.4.6",` des `dependencies`, puis régénérer le lockfile.

Run: `npm install` (à la racine du monorepo) → attendu : succès, `next-themes` retiré du lockfile.

- [ ] **Step 8: Gates**

Run: `rg "dark:" apps/web/components/ui/` → attendu : 0 résultat.
Run: `rg "next-themes" apps/web --glob '!package-lock.json'` → attendu : 0 résultat.
Run: `cd apps/web && npm run typecheck && npm run lint` → attendu : 0 erreur.
Commit après accord utilisateur.

---

### Task 3 : Button unifié — `loading` natif + cible tactile 44 px (P2-5)

**Files:**
- Modify: `apps/web/components/ui/button.tsx`
- Modify: `apps/web/components/ui/primitives.tsx:31-43` (JSDoc de dépréciation uniquement)

**Interfaces:**
- Produces: `Button` (shadcn, `components/ui/button`) accepte une nouvelle prop optionnelle `loading?: boolean`. Quand `loading` : `disabled` forcé, `aria-busy="true"`, spinner `Loader2` en préfixe (sauf si `asChild`, où seul l'état désactivé est propagé — un Slot ne peut pas recevoir d'enfant injecté). Toutes les props existantes inchangées. L'adaptateur `primitives.Button` reste exporté tel quel (compat 13 pages) mais marqué `@deprecated`.

- [ ] **Step 1: Réécrire `apps/web/components/ui/button.tsx`**

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // min-h-11 (44px) = cible tactile WCAG sur les tailles interactives courantes ;
        // xs/sm/icon-* restent compacts pour les toolbars denses (usage desktop).
        default: "h-9 min-h-11 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2",
        lg: "h-10 min-h-11 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** État de soumission : désactive le bouton, affiche un spinner, annonce aria-busy. */
  loading?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {!asChild && loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
```

Note compat : les usages existants passant déjà `h-14`/`h-12` en `className` (ex. `CandidateVoteClient`) gardent leur hauteur — `h-*` et `min-h-11` cohabitent sans conflit dès lors que la hauteur explicite ≥ 44 px.

- [ ] **Step 2: Marquer l'adaptateur comme déprécié dans `primitives.tsx`** — remplacer le commentaire de section Button (lignes 31-32) par :

```tsx
/* ── Button ────────────────────────────────────────────────────────────────
   API historique : variant primary|secondary|destructive|ghost + loading. */
/**
 * @deprecated Utiliser `Button` de `@/components/ui/button` (variant `default`
 * au lieu de `primary`, prop `loading` native). Cet adaptateur sera retiré
 * quand les 13 pages consommatrices auront migré (phases B–E).
 */
```

(le reste de `primitives.tsx` inchangé à ce stade.)

- [ ] **Step 3: Gates**

Run: `cd apps/web && npm run typecheck && npm run lint` → attendu : 0 erreur.
Checkpoint visuel : les boutons `size="default"`/`lg` affichent 44 px de hauteur minimale ; aucun autre diff. Commit après accord utilisateur.

---

### Task 4 : Card — variant `surface` (default | glass | glassStrong | glassSubtle)

**Files:**
- Modify: `apps/web/components/ui/card.tsx`
- Modify: `apps/web/components/ui/index.ts:49` (export du type)

**Interfaces:**
- Produces: `Card` accepte `surface?: "default" | "glass" | "glassStrong" | "glassSubtle"` (défaut `"default"` → rendu identique à aujourd'hui). Les surfaces glass réutilisent les classes `.vp-glass*` de `globals.css` (déjà chargées globalement). Export du type `CardProps`.

Prépare D2 (immersif généralisé) : une seule carte, quatre tons, au lieu des trois systèmes actuels (P1-3). Migration des consommateurs = phases B–E.

- [ ] **Step 1: Réécrire `apps/web/components/ui/card.tsx` (fonction `Card` uniquement, le reste inchangé)**

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "flex flex-col gap-6 rounded-xl py-6 text-card-foreground",
  {
    variants: {
      surface: {
        default: "border bg-card shadow-sm",
        glass: "vp-glass",
        glassStrong: "vp-glass-strong",
        glassSubtle: "vp-glass-subtle",
      },
    },
    defaultVariants: { surface: "default" },
  }
)

export interface CardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardVariants> {}

function Card({ className, surface = "default", ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-surface={surface}
      className={cn(cardVariants({ surface, className }))}
      {...props}
    />
  )
}
```

(Conserver `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` et le bloc export existants ; ajouter `cardVariants` à l'export.)

- [ ] **Step 2: `index.ts`** — ajouter `cardVariants` et le type à l'export existant :

```ts
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants } from "./card";
export type { CardProps } from "./card";
```

- [ ] **Step 3: Gates**

Run: `cd apps/web && npm run typecheck && npm run lint` → attendu : 0 erreur.
Checkpoint visuel : aucun diff (défaut `default` partout). Commit après accord utilisateur.

---

### Task 5 : StatusChip sur tokens sémantiques (P1-4)

**Files:**
- Modify: `apps/web/app/globals.css` (ajout de 2 tokens texte, additif uniquement)
- Modify: `apps/web/components/ui/primitives.tsx:162-232` (bloc StatusChip complet)

**Interfaces:**
- Consumes: tokens `--color-success`, `--color-warning`, `--color-error`, `--color-info` (existants) + nouveaux `--color-warning-text`, `--color-info-text`.
- Produces: même API `StatusChip({ label, tone })`, mêmes 9 tons. Couleurs désormais 100 % tokens ; classes `dark:` retirées ; paires texte/fond contrastées ≥ 4,5:1.

- [ ] **Step 1: Ajouter les tokens texte manquants dans `globals.css`** — dans le bloc `@theme`, juste après `--color-success-text: #059669;` / `--color-error-text: #DC2626;` :

```css
  --color-warning-text: #B45309;
  --color-info-text: #1D4ED8;
```

(Additif pur : aucune classe existante ne référence ces variables → zéro effet visuel, Home incluse.)

- [ ] **Step 2: Réécrire le bloc StatusChip dans `primitives.tsx`** (remplacer `chipVariants` et garder `CHIP_ICON`, `StatusChipProps`, `StatusChip` inchangés sauf mention ci-dessous) :

```tsx
const chipVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        live: "border-[var(--color-info)]/30 bg-[var(--color-info)]/10 text-[var(--color-info-text)]",
        active:
          "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success-text)]",
        success:
          "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success-text)]",
        pending:
          "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning-text)]",
        warning:
          "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning-text)]",
        paused:
          "border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error-text)]",
        error:
          "border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error-text)]",
        draft:
          "border-slate-200 bg-slate-100 text-slate-700",
        muted:
          "border-slate-200 bg-slate-100 text-slate-700",
      },
    },
    defaultVariants: { tone: "muted" },
  }
)
```

(`slate` conservé pour les tons neutres : c'est le neutre de la palette, pas une couleur de statut ad-hoc.)

- [ ] **Step 3: Gates**

Run: `rg "dark:|sky-|amber-|green-|red-" apps/web/components/ui/primitives.tsx` → attendu : 0 résultat.
Run: `cd apps/web && npm run typecheck && npm run lint` → attendu : 0 erreur.
Checkpoint visuel : chips quasiment identiques (légère harmonisation des teintes acceptée et voulue). Commit après accord utilisateur.

---

### Task 6 : React Query — hooks domaine + migration pilote du dashboard home (P1-1, P1-9)

**Files:**
- Create: `apps/web/lib/hooks/use-organizer-events.ts`
- Modify: `apps/web/app/dashboard/page.tsx` (réécriture)

**Interfaces:**
- Consumes: `authedFetch` (`lib/api.ts`), `getStoredToken` (`lib/auth.ts`), `getPaymentSetupStatus(token)` (`lib/organizer-secrets.ts:24` → `{ readyForVotes: boolean }` entre autres champs), `getEventPartnerStatus(token, eventId)` (`lib/partners.ts:173` → `{ isPartnerEvent: boolean }` entre autres champs), `authLoginUrl` (`lib/auth-navigation.ts`), `formatEventStatus` (`lib/i18n.ts`).
- Produces (utilisés par les phases B–E) :
  - `useOrganizerEvents(enabled: boolean): UseQueryResult<OrganizerEventItem[]>` — `queryKey: ["organizer", "events"]`
  - `usePaymentReadiness(latestEventId?: string): { ready: boolean; skipPaymentStep: boolean }` — `queryKey: ["organizer", "payment-setup"]` et `["organizer", "partner-status", eventId]`
  - `OrganizerEventItem = { id: string; title: string; slug: string; status: string; candidateCount: number }`

- [ ] **Step 1: Créer `apps/web/lib/hooks/use-organizer-events.ts`**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { authedFetch } from "../api";
import { getStoredToken } from "../auth";
import { getPaymentSetupStatus } from "../organizer-secrets";
import { getEventPartnerStatus } from "../partners";

export type OrganizerEventItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  candidateCount: number;
};

/** Liste des événements du tenant courant (GET /events, Bearer auto via authedFetch). */
export function useOrganizerEvents(enabled: boolean) {
  return useQuery({
    queryKey: ["organizer", "events"],
    enabled,
    queryFn: () => authedFetch<OrganizerEventItem[]>("/events"),
  });
}

/**
 * L'organisateur peut-il encaisser des votes ? Vrai si le setup PSP est prêt
 * OU si le dernier événement est un événement partenaire (paiement géré).
 * Tolérant aux erreurs : en cas d'échec, on retombe sur "pas prêt" (le
 * checklist onboarding affiche alors l'étape paiement, comportement actuel).
 */
export function usePaymentReadiness(latestEventId: string | undefined) {
  const setup = useQuery({
    queryKey: ["organizer", "payment-setup"],
    queryFn: async (): Promise<{ readyForVotes: boolean }> => {
      const token = getStoredToken();
      if (!token) return { readyForVotes: false };
      try {
        return await getPaymentSetupStatus(token);
      } catch {
        return { readyForVotes: false };
      }
    },
  });

  const partner = useQuery({
    queryKey: ["organizer", "partner-status", latestEventId],
    enabled: Boolean(latestEventId) && Boolean(getStoredToken()),
    queryFn: async (): Promise<{ isPartnerEvent: boolean }> => {
      const token = getStoredToken();
      if (!token || !latestEventId) return { isPartnerEvent: false };
      try {
        return await getEventPartnerStatus(token, latestEventId);
      } catch {
        return { isPartnerEvent: false };
      }
    },
  });

  const skipPaymentStep = partner.data?.isPartnerEvent ?? false;
  const ready = skipPaymentStep || (setup.data?.readyForVotes ?? false);
  return { ready, skipPaymentStep };
}
```

- [ ] **Step 2: Réécrire `apps/web/app/dashboard/page.tsx`** — même rendu, même comportement (redirect `/dashboard/start` si zéro événement), mais data via hooks et états via `LoadingState`/`FormError` :

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import {
  useOrganizerEvents,
  usePaymentReadiness,
} from "../../lib/hooks/use-organizer-events";
import { KpiCard, StatusChip, EmptyState, LoadingState, Button, FormError } from "@/components/ui";
import { OnboardingChecklist } from "../../components/onboarding-checklist";
import { CopyPublicLinkButton } from "../../components/copy-public-link-button";
import { formatEventStatus } from "../../lib/i18n";

export default function DashboardHomePage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) router.push(authLoginUrl());
  }, [hasToken, router]);

  const eventsQuery = useOrganizerEvents(hasToken);
  const events = eventsQuery.data ?? [];
  const latest = events[0];
  const { ready: paymentReady, skipPaymentStep } = usePaymentReadiness(latest?.id);

  useEffect(() => {
    if (eventsQuery.isSuccess && events.length === 0) {
      router.replace("/dashboard/start");
    }
  }, [eventsQuery.isSuccess, events.length, router]);

  const activeEvents = events.filter((item) => item.status === "ACTIVE").length;
  const recentEvents = events.slice(0, 5);

  if (eventsQuery.isPending) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading dashboard metrics…" : "Chargement des indicateurs…"} />;
  }

  if (eventsQuery.isError) {
    return (
      <FormError>
        {eventsQuery.error instanceof Error
          ? eventsQuery.error.message
          : isEn ? "Loading failed." : "Erreur de chargement."}
      </FormError>
    );
  }

  return (
    <div className="space-y-10">
      <OnboardingChecklist events={events} isEn={isEn} paymentReady={paymentReady} skipPaymentStep={skipPaymentStep} />

      <header className="flex flex-col justify-between gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <span className="block text-sm font-bold uppercase tracking-widest text-primary">{isEn ? "Overview" : "Aperçu"}</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            {isEn ? "Your events at a glance" : "Vos évènements en un coup d'œil"}
          </h2>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label={isEn ? "Total events" : "Évènements au total"} value={String(events.length)} />
        <KpiCard label={isEn ? "Active events" : "Évènements actifs"} value={String(activeEvents)} />
        <KpiCard label={isEn ? "Latest event" : "Dernier évènement"} value={events[0]?.title ?? "…"} />
      </section>

      <section>
        <h3 className="mb-4 text-xl font-bold tracking-tight text-foreground">{isEn ? "Recent events" : "Évènements récents"}</h3>
        {recentEvents.length === 0 ? (
          <EmptyState
            title={isEn ? "No events yet." : "Aucun évènement pour le moment."}
            description={isEn ? "Launch your first event in one step." : "Lancez votre premier évènement en une étape."}
            action={
              <Button asChild className="mt-2">
                <Link href="/dashboard/start">{isEn ? "Launch event" : "Lancer un évènement"}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {recentEvents.map((eventItem) => (
              <li
                key={eventItem.id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow sm:flex-row sm:items-center"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <StatusChip
                    label={formatEventStatus(eventItem.status, isEn)}
                    tone={eventItem.status === "ACTIVE" ? "active" : "muted"}
                  />
                  <strong className="text-foreground">{eventItem.title}</strong>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <CopyPublicLinkButton eventSlug={eventItem.slug} isEn={isEn} />
                  <Link
                    href={`/dashboard/events/${eventItem.id}/candidates`}
                    className="text-sm font-semibold text-primary transition-all hover:text-primary/80 hover:underline"
                  >
                    {isEn ? "Candidates" : "Candidats"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

Comportement préservé à vérifier : le token absent → `router.push(authLoginUrl())` ; `paymentReady`/`skipPaymentStep` alimentent `OnboardingChecklist` avec les mêmes valeurs qu'avant (partner prioritaire sur setup) ; les strings ternaires `isEn` restent en place ici — la migration i18n complète des pages se fera zone par zone (spec §7).

- [ ] **Step 3: Gates**

Run: `cd apps/web && npm run typecheck && npm run lint` → attendu : 0 erreur.
Checkpoint fonctionnel (dev + API locale) : `/dashboard` affiche KPI + liste identiques, skeleton pendant le chargement, erreur dans un `FormError`. Commit après accord utilisateur.

---

### Task 7 : Retrait de GSAP des dépendances web (P2-6)

**Files:**
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: bundle allégé ; `design-system/gsap-presets.ts` reste en place hors `apps/web` (non compilé par Next, aucun import — vérifié par grep : zéro occurrence de `gsap` hors `package.json`).

- [ ] **Step 1: Supprimer les deux lignes de `dependencies`**

```jsonc
// à retirer de apps/web/package.json
"@gsap/react": "^2.1.2",
"gsap": "^3.15.0",
```

- [ ] **Step 2: Régénérer le lockfile et vérifier**

Run: `npm install` (racine monorepo) → attendu : succès.
Run: `rg -i "gsap" apps/web --glob '!package-lock.json'` → attendu : 0 résultat.
Run: `cd apps/web && npm run typecheck && npm run build` → attendu : succès.
Commit après accord utilisateur.

---

### Task 8 : i18n — clés navigation + migration de la sidebar dashboard (P1-2, amorce)

**Files:**
- Modify: `apps/web/lib/i18n.ts` (ajout de clés FR lignes ~13-24 et EN lignes ~180-191)
- Modify: `apps/web/components/dashboard-sidebar.tsx`

**Interfaces:**
- Consumes: `t(key)` de `useI18n()` (`lib/i18n-provider.tsx`).
- Produces: nouvelles clés — `nav.ticketing`, `nav.search`, `nav.wallet`, `nav.offer`, `nav.platformAdmin`, `nav.openMenu`, `nav.closeMenu`, `nav.expandSidebar`, `nav.collapseSidebar`. La sidebar n'utilise plus aucun ternaire `isEn`.

- [ ] **Step 1: Ajouter les clés FR dans `lib/i18n.ts`** (à la suite de `"nav.notifications": "Notifications",`) :

```ts
    "nav.ticketing": "Billetterie",
    "nav.search": "Recherche",
    "nav.wallet": "Portefeuille",
    "nav.offer": "Mon offre",
    "nav.platformAdmin": "Admin plateforme",
    "nav.openMenu": "Ouvrir le menu",
    "nav.closeMenu": "Fermer le menu",
    "nav.expandSidebar": "Déplier la navigation",
    "nav.collapseSidebar": "Replier la navigation",
```

- [ ] **Step 2: Ajouter les clés EN** (à la suite de `"nav.notifications": "Notifications",`) :

```ts
    "nav.ticketing": "Ticketing",
    "nav.search": "Search",
    "nav.wallet": "Wallet",
    "nav.offer": "My offer",
    "nav.platformAdmin": "Platform admin",
    "nav.openMenu": "Open menu",
    "nav.closeMenu": "Close menu",
    "nav.expandSidebar": "Expand sidebar",
    "nav.collapseSidebar": "Collapse sidebar",
```

- [ ] **Step 3: Migrer `dashboard-sidebar.tsx`** — remplacer les ternaires :

```tsx
// navItems : 
{ href: "/dashboard/ticketing", label: t("nav.ticketing"), icon: Ticket },
{ href: "/dashboard/search", label: t("nav.search"), icon: Search },
// ...
{ href: "/dashboard/wallet", label: t("nav.wallet"), icon: Wallet },
{ href: "/dashboard/offer", label: t("nav.offer"), icon: CreditCard },
// lien admin :
label: t("nav.platformAdmin"),
// aria-labels :
aria-label={isMobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}
aria-label={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
// "Organizer workspace" / "Espace organisateur" : nouvelle clé nav.workspace
```

Ajouter aussi `"nav.workspace": "Espace organisateur"` (FR) / `"Organizer workspace"` (EN) et l'utiliser. Retirer `const isEn = locale === "en";` et `locale` devenus inutiles (garder `useI18n()` pour `t`). Dépendances du `useMemo` : `[t]` (plus `isEn`).

- [ ] **Step 4: Gates**

Run: `rg "isEn \? " apps/web/components/dashboard-sidebar.tsx` → attendu : 0 résultat.
Run: `cd apps/web && npm run typecheck && npm run lint` → attendu : 0 erreur.
Checkpoint visuel FR et EN : libellés identiques à avant. Commit après accord utilisateur.

---

### Task 9 : Gates de fin de phase + revue Home

- [ ] **Step 1: Qualité**

Run: `cd apps/web && npm run typecheck && npm run lint && npm run build` → attendu : 0 erreur, build succès.

- [ ] **Step 2: E2E (si l'environnement le permet — API locale requise pour certaines specs)**

Run: `cd apps/web && npx playwright test` → attendu : pas de régression sur les specs existantes. Noter dans le compte-rendu les specs skippées faute d'env.

- [ ] **Step 3: Revue visuelle Home (obligatoire, règle §5.8)**

`npm run dev`, ouvrir `/` en 360 / 768 / 1280 / 1440 px : hero three.js, orbs animés, glass cards, carrousels → **strictement identiques à avant**. Tout diff = régression à corriger avant de clore la phase.

- [ ] **Step 4: Revue visuelle zones touchées** : `/dashboard`, `/admin` (contenu cappé 1440 px), un écran avec `StatusChip`, un formulaire (boutons 44 px), toasts Sonner (thème light).

- [ ] **Step 5: Compte-rendu de phase** au format checkpoint (features, fichiers, scores, points d'attention) + proposition d'enchaîner sur le plan Phase B (zone votante `/e/*`).

---

## Self-review effectué

- **Couverture spec** : P0-1 → Task 1 ; D1 → Tasks 2 (+ note mécanisme conservé) ; P1-1/P1-9 → Task 6 ; P2-6 → Task 7 ; P1-2 (amorce) → Task 8 ; P1-3 (amorce Button/Card) → Tasks 3-4 ; P1-4 → Task 5 ; P1-5/P2-5 couverts partiellement (FormError adopté dans la page pilote Task 6, touch targets Task 3). Les items P0-2/P0-3 (IA navigation) et le reste = phases B–E, hors scope Phase A — volontaire.
- **Placeholders** : aucun — chaque step de code contient le code complet.
- **Cohérence de types** : `OrganizerEventItem`, `useOrganizerEvents`, `usePaymentReadiness` définis dans Task 6 et consommés avec les mêmes noms dans la page pilote ; `ButtonProps.loading` (Task 3) n'est pas utilisé avant les phases suivantes ; `CardProps.surface` (Task 4) idem.
- **Risque résiduel connu** : `usePaymentReadiness` interroge le statut partenaire du **premier** événement (comportement actuel préservé volontairement) ; à revoir en Phase D (dashboard decision-first).
