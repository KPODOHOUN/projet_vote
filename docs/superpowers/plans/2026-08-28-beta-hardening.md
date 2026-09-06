# Bêta SHADOMA Votes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une bêta Escrow-only cohérente, i18n unifiée, React Query généralisé, sans régression du funnel vote.

**Architecture:** Six vagues séquentielles (spec `docs/superpowers/specs/2026-08-28-beta-hardening-design.md`). Chaque vague se termine par typecheck + lint web + e2e 19/19.

**Tech Stack:** Next.js 15, React 19, TanStack Query, NestJS, Prisma, Playwright.

## Global Constraints

- `offer1_external_enabled=false` — UI Escrow-only.
- Aucun changement de contrat API vote/paiement sans revue explicite.
- Gate e2e : `cd apps/web && npm run test:e2e` → 19/19.
- Gate lint : `cd apps/web && npm run lint` → 0 erreur.
- Gate types : `npm run typecheck` → 0 erreur.
- Ne pas renommer classes `.vp-*` dans `globals.css` (Home).
- Pas de commit sauf demande utilisateur.

---

## Vague 0 — Clarté produit Escrow (cette session)

### Task 0.1: ChatWidget scopé par pathname

**Files:**
- Modify: `apps/web/components/chat-widget.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: `ChatWidgetGate` — rend `ChatWidget` uniquement sur routes publiques.

- [ ] **Step 1:** Ajouter `ChatWidgetGate` avec `usePathname()` — allowlist `/`, `/e/*`, `/vote`, `/pricing`, `/legal`, `/privacy`, `/terms`, `/cookies`
- [ ] **Step 2:** Remplacer `<ChatWidget />` par `<ChatWidgetGate />` dans `layout.tsx`
- [ ] **Step 3:** `npm run typecheck` dans `apps/web`

### Task 0.2: LanguageSwitcher dashboard + admin

**Files:**
- Modify: `apps/web/components/dashboard-header.tsx`
- Modify: `apps/web/components/admin-header.tsx`

- [ ] **Step 1:** Importer `LanguageSwitcher` depuis `i18n-provider`
- [ ] **Step 2:** Placer avant le bouton logout / à côté des actions header
- [ ] **Step 3:** typecheck

### Task 0.3: Admin legacy replié par défaut

**Files:**
- Modify: `apps/web/components/admin-sidebar.tsx`

- [ ] **Step 1:** État `legacyOpen` default `false` pour section « Hérité »
- [ ] **Step 2:** Bouton toggle avec `ChevronDown` + badge « Déprécié »
- [ ] **Step 3:** typecheck

### Task 0.4: Home — retirer lien Admin public

**Files:**
- Modify: `apps/web/components/app-header.tsx`

- [ ] **Step 1:** Supprimer lien `/admin` desktop (l.69-72) et mobile (l.126-130)
- [ ] **Step 2:** Supprimer variable `isAdmin` inutilisée si présente
- [ ] **Step 3:** typecheck

### Task 0.5: Bannière démo i18n

**Files:**
- Modify: `apps/web/app/dashboard/layout.tsx`
- Modify: `apps/web/lib/i18n.ts` — clés `dash.banner.demoMode` FR/EN

- [ ] **Step 1:** Ajouter clés i18n
- [ ] **Step 2:** `DemoModeBanner` utilise `t()`
- [ ] **Step 3:** typecheck + lint web

### Task 0.6: Gates finales Vague 0

- [ ] **Step 1:** `npm run typecheck` (racine)
- [ ] **Step 2:** `cd apps/web && npm run lint`
- [ ] **Step 3:** `cd apps/web && npm run test:e2e` (si env DB dispo)

---

## Vagues 1–5 (à planifier en détail au fil de l'eau)

- **V1 Auth unifiée** — template auth unique, pages OTP/reset/invitation
- **V2 Dashboard** — hooks RQ domaine, i18n dash.*, decision-first home
- **V3 Admin** — hooks RQ, i18n admin.*, legacy masqué
- **V4 Home** — i18n home.*, header lg, offres Escrow
- **V5 Finitions** — sweep i18n, checklist bêta
