# Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recherche globale tenant-scopée (événements, candidats, membres, paiements) exposée via un endpoint `GET /search`, avec palette typeahead dans le header + page de résultats.

**Architecture:** Nouveau module NestJS `search` (controller + service) faisant des requêtes Prisma `contains`/`insensitive` scopées `tenantId`, gating membres/paiements hors `ORGANIZER_STAFF`. Frontend : `lib/search.ts` + palette debouncée dans `dashboard-header.tsx` + page `/dashboard/search`. Tests vraie DB (isolation tenant + gating) + e2e.

**Tech Stack:** NestJS, Prisma/PostgreSQL, zod, `node:test`, Next.js 15/React 19, Tailwind v4, Playwright.

## Global Constraints

- ZERO fake data ; toute donnée via les contrats réels. ZERO contrôle décoratif.
- TS strict + `exactOptionalPropertyTypes` (front).
- Tests backend : **vraie DB `votezpro_test`**, jamais de mock Prisma (`node:test` + `assert/strict`, `resetDatabase()` en `beforeEach`, service construit en direct). `Event`/`Candidate`/`User`/`Tenant`/`PaymentTransaction` sont déjà dans `test-utils/db.ts` TABLES.
- **Isolation tenant = contrôle primaire** : chaque requête filtre `tenantId` (candidats via `event: { tenantId }`). Jamais de fuite cross-tenant.
- Gating : membres + paiements renvoyés UNIQUEMENT si `user.role !== "ORGANIZER_STAFF"` (sinon `[]`), côté serveur.
- `q` trimé ; si `< 2` caractères → groupes vides, aucune requête DB. `limit` borné `[1, 20]`, défaut `5`. `q` via Prisma `contains` (paramétré).
- i18n : clés `search.*` + tout label header ajoutées en **fr ET en** dans `apps/web/lib/i18n.ts` (sinon `MessageKey` casse le typecheck). Aucune string métier en dur (pattern `isEn ?` toléré).
- Couche dashboard = `vp-*` scaffolding + primitives `@/components/ui`. Pas d'élément brut stylé hors `vp-*`/tokens.
- `apiFetch<T>(path, { headers, signal })` ajoute `Content-Type` + `credentials:"include"` et respecte un `signal` (AbortController).
- Contrats de référence : `docs/superpowers/specs/2026-06-21-global-search-design.md`.
- Vérif backend : `npm run typecheck --workspace=apps/api` + `node --import tsx --test apps/api/src/search/search.service.test.ts`. Vérif front (depuis `apps/web/`) : `npx tsc --noEmit`, `npx eslint .`, `npx next build`.

---

### Task 1: SearchService + tests vraie DB

**Files:**
- Create: `apps/api/src/search/search.service.ts`
- Test: `apps/api/src/search/search.service.test.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuthUser` (`{ userId, tenantId, role, email }`).
- Produces: `SearchService.search(user: AuthUser, rawQuery: unknown): Promise<{ query: string; events: {id,title,slug,status}[]; candidates: {id,fullName,number,eventId,eventTitle}[]; members: {id,email,role}[]; payments: {id,providerRef,status,amountCfa,createdAt,eventId}[] }>`.

- [ ] **Step 1: Écrire les tests** (`search.service.test.ts`) :

```ts
import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { SearchService } from "./search.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import type { AuthUser } from "../auth/auth.types";

const prismaService = new PrismaService();
const searchService = new SearchService(prismaService);

async function seedTenant(slug: string) {
  const tenant = await prisma.tenant.create({ data: { slug, displayName: `T-${slug}` } });
  const owner = await prisma.user.create({ data: { tenantId: tenant.id, email: `owner@${slug}.africa`, passwordHash: "x", role: "ORGANIZER_OWNER" } });
  const event = await prisma.event.create({ data: { tenantId: tenant.id, slug: `${slug}-finale`, title: "Grande Finale", startsAt: new Date(), endsAt: new Date(Date.now() + 1e9) } });
  await prisma.candidate.create({ data: { eventId: event.id, fullName: "Awa Diop", number: 1 } });
  await prisma.paymentTransaction.create({ data: { tenantId: tenant.id, eventId: event.id, provider: "FEEXPAY", amountCfa: 500, providerRef: `REF-${slug}-XYZ`, idempotencyKey: `idem-${slug}-1` } });
  return { tenant, owner, event };
}

function ownerUser(tenantId: string, userId: string): AuthUser {
  return { userId, tenantId, role: "ORGANIZER_OWNER", email: "owner@x" };
}
function staffUser(tenantId: string): AuthUser {
  return { userId: "staff", tenantId, role: "ORGANIZER_STAFF", email: "staff@x" };
}

before(() => assertTestDatabase());
beforeEach(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

test("isolation tenant : un user ne voit jamais les données d'un autre tenant", async () => {
  const a = await seedTenant("aaa");
  await seedTenant("bbb");
  const res = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "Finale" });
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0]?.slug, "aaa-finale");
  // le candidat/paiement du tenant B n'apparaissent pas
  const cand = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "Awa" });
  assert.equal(cand.candidates.length, 1);
  assert.equal(cand.candidates[0]?.eventId, a.event.id);
  const pay = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "REF-" });
  assert.ok(pay.payments.every((p) => p.eventId === a.event.id));
});

test("gating rôle : STAFF ne reçoit ni membres ni paiements", async () => {
  const a = await seedTenant("ccc");
  const owner = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "owner@" });
  assert.ok(owner.members.length >= 1);
  const staff = await searchService.search(staffUser(a.tenant.id), { q: "owner@" });
  assert.equal(staff.members.length, 0);
  const staffPay = await searchService.search(staffUser(a.tenant.id), { q: "REF-" });
  assert.equal(staffPay.payments.length, 0);
});

test("ILIKE insensible à la casse", async () => {
  const a = await seedTenant("ddd");
  const res = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "fin" });
  assert.equal(res.events.length, 1);
});

test("q court (< 2) → tout vide", async () => {
  const a = await seedTenant("eee");
  const res = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "a" });
  assert.deepEqual([res.events, res.candidates, res.members, res.payments], [[], [], [], []]);
});
```

- [ ] **Step 2: Lancer → échec attendu.**

Run: `node --import tsx --test apps/api/src/search/search.service.test.ts`
Expected: FAIL (`SearchService` n'existe pas).

- [ ] **Step 3: Implémenter `search.service.ts`** :

```ts
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

const searchQuerySchema = z.object({
  q: z.string().optional().default(""),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5)
});

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: AuthUser, rawQuery: unknown) {
    const parsed = searchQuerySchema.parse(rawQuery);
    const q = parsed.q.trim();
    const limit = parsed.limit;
    const empty = { query: q, events: [], candidates: [], members: [], payments: [] };
    if (q.length < 2) return empty;

    const canSeeSensitive = user.role !== "ORGANIZER_STAFF";
    const insensitive = { contains: q, mode: "insensitive" as const };

    const events = await this.prisma.client.event.findMany({
      where: { tenantId: user.tenantId, OR: [{ title: insensitive }, { slug: insensitive }] },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, slug: true, status: true }
    });

    const candidateRows = await this.prisma.client.candidate.findMany({
      where: { fullName: insensitive, event: { tenantId: user.tenantId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, fullName: true, number: true, event: { select: { id: true, title: true } } }
    });

    const members = canSeeSensitive
      ? await this.prisma.client.user.findMany({
          where: { tenantId: user.tenantId, email: insensitive },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, email: true, role: true }
        })
      : [];

    const paymentRows = canSeeSensitive
      ? await this.prisma.client.paymentTransaction.findMany({
          where: { tenantId: user.tenantId, providerRef: insensitive },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, providerRef: true, status: true, amountCfa: true, createdAt: true, eventId: true }
        })
      : [];

    return {
      query: q,
      events,
      candidates: candidateRows.map((c) => ({ id: c.id, fullName: c.fullName, number: c.number, eventId: c.event.id, eventTitle: c.event.title })),
      members,
      payments: paymentRows.map((p) => ({ id: p.id, providerRef: p.providerRef, status: p.status, amountCfa: p.amountCfa, createdAt: p.createdAt.toISOString(), eventId: p.eventId }))
    };
  }
}
```

- [ ] **Step 4: Lancer → succès.**

Run: `node --import tsx --test apps/api/src/search/search.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + Commit**

Run: `npm run typecheck --workspace=apps/api` → 0 erreur.
```bash
git add apps/api/src/search/search.service.ts apps/api/src/search/search.service.test.ts
git commit -m "feat(search): tenant-scoped search service + real-db tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: SearchController + module + suite wiring

**Files:**
- Create: `apps/api/src/search/search.controller.ts`
- Create: `apps/api/src/search/search.module.ts`
- Modify: `apps/api/src/app.module.ts` (importer `SearchModule`)
- Modify: `apps/api/package.json` (ajouter le test à `test` + `test:coverage`)

**Interfaces:**
- Consumes: `SearchService` (Task 1), `AuthGuard`, `@CurrentUser`.
- Produces: route `GET /search`.

- [ ] **Step 1: Créer `search.controller.ts`** :

```ts
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { SearchService } from "./search.service";

@Controller("search")
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.searchService.search(user, query);
  }
}
```

- [ ] **Step 2: Créer `search.module.ts`** :

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma/prisma.service";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchService, PrismaService]
})
export class SearchModule {}
```

- [ ] **Step 3: Enregistrer dans `app.module.ts`.** Ajouter `import { SearchModule } from "./search/search.module";` et `SearchModule` au tableau `imports`.

- [ ] **Step 4: Câbler le test dans la suite.** Dans `apps/api/package.json`, ajouter `dist/search/search.service.test.js` aux listes de fichiers des scripts `test` ET `test:coverage` (près de `dist/account/account.service.test.js`).

- [ ] **Step 5: Typecheck + lancer le test account+search en sanity.**

Run: `npm run typecheck --workspace=apps/api && node --import tsx --test apps/api/src/search/search.service.test.ts`
Expected: 0 erreur TS ; 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/search/search.controller.ts apps/api/src/search/search.module.ts apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(search): controller + module wiring + suite entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Clés i18n

**Files:**
- Modify: `apps/web/lib/i18n.ts` (blocs `fr` et `en`)

**Interfaces:**
- Produces: clés `search.*` consommées par Tasks 5–6.

- [ ] **Step 1: Ajouter en FR** (à la suite des clés existantes du bloc `fr`) :

```ts
    "search.placeholder": "Rechercher événements, candidats…",
    "search.label": "Recherche globale",
    "search.groupEvents": "Événements",
    "search.groupCandidates": "Candidats",
    "search.groupMembers": "Membres",
    "search.groupPayments": "Paiements",
    "search.seeAll": "Voir tous les résultats",
    "search.loading": "Recherche…",
    "search.noResults": "Aucun résultat",
    "search.error": "Recherche impossible.",
    "search.prompt": "Tapez pour rechercher dans votre organisation.",
    "search.resultsTitle": "Résultats de recherche",
    "search.candidateOn": "dans",
```

- [ ] **Step 2: Ajouter les MÊMES clés en EN** :

```ts
    "search.placeholder": "Search events, candidates…",
    "search.label": "Global search",
    "search.groupEvents": "Events",
    "search.groupCandidates": "Candidates",
    "search.groupMembers": "Members",
    "search.groupPayments": "Payments",
    "search.seeAll": "See all results",
    "search.loading": "Searching…",
    "search.noResults": "No results",
    "search.error": "Search failed.",
    "search.prompt": "Type to search within your organization.",
    "search.resultsTitle": "Search results",
    "search.candidateOn": "in",
```

- [ ] **Step 3: Typecheck.**

Run (depuis `apps/web/`): `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n.ts
git commit -m "feat(web): i18n keys for global search

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Couche données `lib/search.ts`

**Files:**
- Create: `apps/web/lib/search.ts`

**Interfaces:**
- Consumes: `apiFetch` (`./api`).
- Produces: types `SearchEvent/SearchCandidate/SearchMember/SearchPayment/SearchResults/SearchKind` ; `search(token, q, limit, signal?)` ; `searchResultHref(kind, item)`.

- [ ] **Step 1: Créer le fichier**

```ts
import { apiFetch } from "./api";

export type SearchEvent = { id: string; title: string; slug: string; status: string };
export type SearchCandidate = { id: string; fullName: string; number: number; eventId: string; eventTitle: string };
export type SearchMember = { id: string; email: string; role: string };
export type SearchPayment = { id: string; providerRef: string | null; status: string; amountCfa: number; createdAt: string; eventId: string };
export type SearchResults = {
  query: string;
  events: SearchEvent[];
  candidates: SearchCandidate[];
  members: SearchMember[];
  payments: SearchPayment[];
};

export function search(token: string, q: string, limit: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<SearchResults>(`/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    ...(signal ? { signal } : {})
  });
}

export type SearchKind = "event" | "candidate" | "member" | "payment";

export function searchResultHref(kind: SearchKind, item: { id: string; eventId?: string }): string {
  switch (kind) {
    case "event":
      return `/dashboard/events/${item.id}/candidates`;
    case "candidate":
      return `/dashboard/events/${item.eventId}/candidates`;
    case "member":
      return "/dashboard/team";
    case "payment":
      return "/dashboard/payments";
  }
}
```

- [ ] **Step 2: Typecheck.**

Run (depuis `apps/web/`): `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/search.ts
git commit -m "feat(web): search API client + result href helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Palette de recherche dans le header

**Files:**
- Modify: `apps/web/components/dashboard-header.tsx`
- Modify: `apps/web/app/globals.css` (styles palette)

**Interfaces:**
- Consumes: `search`/`searchResultHref`/types (Task 4), `getStoredToken` (`lib/auth`), `useI18n`, clés `search.*` (Task 3).
- Produces: palette typeahead globale dans le header.

- [ ] **Step 1: Réécrire `dashboard-header.tsx`** (ajoute la palette à gauche, garde compte + logout à droite) :

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, UserCircle, Calendar, Users, CreditCard, UserPlus } from "lucide-react";
import { useI18n } from "../lib/i18n-provider";
import { apiFetch } from "../lib/api";
import { getStoredToken, clearAuthStorage } from "../lib/auth";
import { search, searchResultHref, type SearchResults } from "../lib/search";

export function DashboardHeader() {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const logout = async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    clearAuthStorage();
    router.push("/login");
  };

  // Debounce 250ms + ignore stale responses (reqId) + abort in-flight.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setIsLoading(false); setError(false); return; }
    const token = getStoredToken();
    if (!token) return;
    const controller = new AbortController();
    const id = ++reqId.current;
    setIsLoading(true); setError(false);
    const timer = setTimeout(() => {
      void search(token, term, 5, controller.signal)
        .then((res) => { if (id === reqId.current) { setResults(res); setIsLoading(false); } })
        .catch(() => { if (id === reqId.current) { setError(true); setIsLoading(false); } });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (href: string) => { setIsOpen(false); setQ(""); router.push(href); };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length >= 2) { setIsOpen(false); router.push(`/dashboard/search?q=${encodeURIComponent(term)}`); }
  };

  const hasAny = results != null && (results.events.length + results.candidates.length + results.members.length + results.payments.length) > 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 border-b border-border bg-card/80 px-6 shadow-sm backdrop-blur-md sm:px-8">
      <div ref={boxRef} className="vp-search">
        <form onSubmit={onSubmit} role="search">
          <Search className="vp-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="vp-search-input"
            placeholder={t("search.placeholder")}
            aria-label={t("search.label")}
            aria-expanded={isOpen}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => { if (e.key === "Escape") setIsOpen(false); }}
          />
        </form>
        {isOpen && q.trim().length >= 2 ? (
          <div className="vp-search-panel" role="listbox" aria-label={t("search.label")}>
            {isLoading ? (
              <p className="vp-search-status">{t("search.loading")}</p>
            ) : error ? (
              <p className="vp-search-status vp-error">{t("search.error")}</p>
            ) : !hasAny ? (
              <p className="vp-search-status">{t("search.noResults")}</p>
            ) : (
              <>
                {results!.events.length > 0 ? (
                  <div className="vp-search-group">
                    <span className="vp-search-group-title"><Calendar className="size-3.5" aria-hidden="true" /> {t("search.groupEvents")}</span>
                    {results!.events.map((it) => (
                      <button key={it.id} type="button" role="option" aria-selected="false" className="vp-search-item" onClick={() => go(searchResultHref("event", it))}>
                        <strong>{it.title}</strong><span>@{it.slug}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {results!.candidates.length > 0 ? (
                  <div className="vp-search-group">
                    <span className="vp-search-group-title"><Users className="size-3.5" aria-hidden="true" /> {t("search.groupCandidates")}</span>
                    {results!.candidates.map((it) => (
                      <button key={it.id} type="button" role="option" aria-selected="false" className="vp-search-item" onClick={() => go(searchResultHref("candidate", it))}>
                        <strong>{it.fullName}</strong><span>{t("search.candidateOn")} {it.eventTitle}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {results!.members.length > 0 ? (
                  <div className="vp-search-group">
                    <span className="vp-search-group-title"><UserPlus className="size-3.5" aria-hidden="true" /> {t("search.groupMembers")}</span>
                    {results!.members.map((it) => (
                      <button key={it.id} type="button" role="option" aria-selected="false" className="vp-search-item" onClick={() => go(searchResultHref("member", it))}>
                        <strong>{it.email}</strong><span>{it.role}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {results!.payments.length > 0 ? (
                  <div className="vp-search-group">
                    <span className="vp-search-group-title"><CreditCard className="size-3.5" aria-hidden="true" /> {t("search.groupPayments")}</span>
                    {results!.payments.map((it) => (
                      <button key={it.id} type="button" role="option" aria-selected="false" className="vp-search-item" onClick={() => go(searchResultHref("payment", it))}>
                        <strong>{it.providerRef ?? "—"}</strong><span>{it.amountCfa.toLocaleString("fr-FR")} XOF · {it.status}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <Link href={`/dashboard/search?q=${encodeURIComponent(q.trim())}`} className="vp-search-all" onClick={() => setIsOpen(false)}>
                  {t("search.seeAll")} →
                </Link>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserCircle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <span className="hidden md:inline">{t("common.account")}</span>
        </span>
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {t("nav.logout")}
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Ajouter les styles palette** dans `apps/web/app/globals.css` (à la suite), tokens uniquement :

```css
/* Palette de recherche du header. */
.vp-search { position: relative; width: 100%; max-width: 420px; }
.vp-search form { position: relative; display: flex; align-items: center; }
.vp-search-icon { position: absolute; left: 12px; width: 16px; height: 16px; color: var(--vp-muted); pointer-events: none; }
.vp-search-input {
  width: 100%; height: 40px; padding: 0 12px 0 36px;
  border: 1px solid var(--vp-line); border-radius: 10px;
  background: var(--color-muted); color: var(--vp-ink); font-size: 14px;
}
.vp-search-input:focus { outline: none; border-color: var(--color-primary); background: var(--color-card); }
.vp-search-panel {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 50;
  max-height: 70vh; overflow-y: auto; padding: 8px;
  border: 1px solid var(--vp-line); border-radius: 12px;
  background: var(--color-card); box-shadow: 0 12px 32px rgba(0,0,0,0.12);
}
.vp-search-status { padding: 12px; font-size: 13px; color: var(--vp-muted); }
.vp-search-group { padding: 4px 0; }
.vp-search-group + .vp-search-group { border-top: 1px solid var(--vp-line); }
.vp-search-group-title { display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vp-muted); }
.vp-search-item { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 8px 10px; text-align: left; border-radius: 8px; background: none; border: 0; cursor: pointer; }
.vp-search-item:hover, .vp-search-item:focus-visible { background: var(--color-muted); outline: none; }
.vp-search-item strong { font-size: 14px; color: var(--vp-ink); }
.vp-search-item span { font-size: 12px; color: var(--vp-muted); }
.vp-search-all { display: block; padding: 10px; text-align: center; font-size: 13px; font-weight: 600; color: var(--color-primary); border-top: 1px solid var(--vp-line); }
```

- [ ] **Step 3: Typecheck + lint + build.**

Run (depuis `apps/web/`): `npx tsc --noEmit && npx eslint components/dashboard-header.tsx && npx next build`
Expected: 0 erreur ; build exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/dashboard-header.tsx apps/web/app/globals.css
git commit -m "feat(web): global search palette in dashboard header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Page `/dashboard/search`

**Files:**
- Create: `apps/web/app/dashboard/search/page.tsx` (server, Suspense wrapper)
- Create: `apps/web/app/dashboard/search/SearchResultsClient.tsx` (client)

**Interfaces:**
- Consumes: `search`/`searchResultHref`/types (Task 4), `getStoredToken`, `useI18n`, primitives `LoadingState`/`EmptyState`, clés `search.*`.
- Produces: route `/dashboard/search`.

- [ ] **Step 1: Créer `page.tsx`** (Suspense requis pour `useSearchParams`) :

```tsx
import { Suspense } from "react";
import { SearchResultsClient } from "./SearchResultsClient";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchResultsClient />
    </Suspense>
  );
}
```

- [ ] **Step 2: Créer `SearchResultsClient.tsx`** :

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n-provider";
import { getStoredToken } from "../../../lib/auth";
import { search, searchResultHref, type SearchResults } from "../../../lib/search";
import { LoadingState, EmptyState } from "@/components/ui";

export function SearchResultsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const q = params.get("q") ?? "";
  const [term, setTerm] = useState(q);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setTerm(q); }, [q]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults(null); return; }
    const token = getStoredToken();
    if (!token) { router.push("/login"); return; }
    setIsLoading(true); setError("");
    void search(token, trimmed, 20)
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : t("search.error")))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, router]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.replace(`/dashboard/search?q=${encodeURIComponent(term.trim())}`);
  };

  const total = results ? results.events.length + results.candidates.length + results.members.length + results.payments.length : 0;

  return (
    <section>
      <header className="vp-block-head">
        <div>
          <span className="vp-eyebrow">{isEn ? "Search" : "Recherche"}</span>
          <h2 className="vp-block-title">{t("search.resultsTitle")}</h2>
        </div>
      </header>

      <form className="vp-filter-bar vp-form" onSubmit={onSubmit} role="search">
        <label>
          {t("search.label")}
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("search.placeholder")} />
        </label>
      </form>

      {q.trim().length < 2 ? (
        <p className="vp-muted">{t("search.prompt")}</p>
      ) : isLoading ? (
        <LoadingState variant="rows" count={5} label={t("search.loading")} />
      ) : error ? (
        <p className="vp-error" role="alert">{error}</p>
      ) : total === 0 ? (
        <EmptyState title={t("search.noResults")} description={t("search.prompt")} />
      ) : (
        <div className="vp-stack-lg">
          {results!.events.length > 0 ? (
            <section>
              <h3 className="vp-section-title">{t("search.groupEvents")}</h3>
              <ul className="vp-event-rows">
                {results!.events.map((it) => (
                  <li key={it.id}><Link href={searchResultHref("event", it)} className="vp-event-row-meta"><strong>{it.title}</strong><span>@{it.slug} · {it.status}</span></Link></li>
                ))}
              </ul>
            </section>
          ) : null}
          {results!.candidates.length > 0 ? (
            <section>
              <h3 className="vp-section-title">{t("search.groupCandidates")}</h3>
              <ul className="vp-event-rows">
                {results!.candidates.map((it) => (
                  <li key={it.id}><Link href={searchResultHref("candidate", it)} className="vp-event-row-meta"><strong>{it.fullName}</strong><span>{t("search.candidateOn")} {it.eventTitle}</span></Link></li>
                ))}
              </ul>
            </section>
          ) : null}
          {results!.members.length > 0 ? (
            <section>
              <h3 className="vp-section-title">{t("search.groupMembers")}</h3>
              <ul className="vp-event-rows">
                {results!.members.map((it) => (
                  <li key={it.id}><Link href={searchResultHref("member", it)} className="vp-event-row-meta"><strong>{it.email}</strong><span>{it.role}</span></Link></li>
                ))}
              </ul>
            </section>
          ) : null}
          {results!.payments.length > 0 ? (
            <section>
              <h3 className="vp-section-title">{t("search.groupPayments")}</h3>
              <ul className="vp-event-rows">
                {results!.payments.map((it) => (
                  <li key={it.id}><Link href={searchResultHref("payment", it)} className="vp-event-row-meta"><strong>{it.providerRef ?? "—"}</strong><span>{it.amountCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF · {it.status}</span></Link></li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Typecheck + lint + build.**

Run (depuis `apps/web/`): `npx tsc --noEmit && npx eslint app/dashboard/search && npx next build`
Expected: 0 erreur ; route `/dashboard/search` présente.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/search
git commit -m "feat(web): global search results page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: e2e + vérification finale

**Files:**
- Create: `apps/web/tests/e2e/search.spec.ts`

**Interfaces:**
- Consumes: la palette header + la page `/dashboard/search`. Réutilise le harnais e2e (register tenant+OWNER via API, login UI, créer un événement) déjà utilisé par `invitations.spec.ts`.

- [ ] **Step 1: Lire le harnais.**

Run: `sed -n '1,60p' apps/web/tests/e2e/invitations.spec.ts`
Expected: récupérer register+login + comment un événement est seedé (via UI `/dashboard/events/new` ou API).

- [ ] **Step 2: Écrire `search.spec.ts`** (adapter au harnais ; seeder un événement dont le titre est connu, puis chercher dessus) :

```ts
import { test, expect } from "@playwright/test";
// Réutiliser le helper register+login OWNER + la création d'un événement du harnais.

test.describe("Recherche globale", () => {
  test("typeahead header montre un événement et la page résultats l'affiche", async ({ page }) => {
    // 1. register+login OWNER, créer un événement au titre connu (ex. "Concours Test <ts>")
    const title = `Concours ${Date.now()}`;
    // … créer l'événement via le flux du harnais …
    // 2. Taper dans le champ de recherche du header
    await page.getByRole("searchbox", { name: /recherche globale|global search/i }).fill(title.slice(0, 10));
    // 3. Le dropdown montre l'événement
    await expect(page.locator(".vp-search-panel")).toContainText(title);
    // 4. Entrée → page résultats
    await page.getByRole("searchbox", { name: /recherche globale|global search/i }).press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/search\?q=/);
    await expect(page.locator(".vp-event-rows")).toContainText(title);
  });
});
```

- [ ] **Step 3: Lancer l'e2e** comme la suite du repo (Playwright webServer + API Postgres). Si la stack ne démarre pas ici, NE PAS simuler : reporter DONE_WITH_CONCERNS avec la commande. Sinon filtrer sur `search`.

- [ ] **Step 4: Vérification finale.**

Run: `npm run typecheck --workspace=apps/api && node --import tsx --test apps/api/src/search/search.service.test.ts` puis (depuis `apps/web/`) `npx tsc --noEmit && npx eslint . && npx next build`
Expected: tests backend PASS (4) ; 0 erreur TS/lint ; build prod exit 0 ; routes `/dashboard/search` présente.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/search.spec.ts
git commit -m "test(web): e2e for global search

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Endpoint `GET /search?q=&limit=` tenant-scopé, q<2→vide, limit borné → Task 1 (service) + Task 2 (route) ✅
- 4 entités (events/candidates via event.tenantId/members/payments) → Task 1 ✅
- Gating membres+paiements hors STAFF → Task 1 (`canSeeSensitive`) + test Task 1 ✅
- Isolation tenant + test anti-fuite → Task 1 ✅
- ILIKE insensible + q court → Task 1 tests ✅
- Suite CI wiring → Task 2 Step 4 ✅
- lib/search.ts + searchResultHref → Task 4 ✅
- Palette header debouncée + abort stale + dropdown groupé + a11y → Task 5 ✅
- Page /dashboard/search (Suspense + useSearchParams) + états → Task 6 ✅
- i18n fr/en → Task 3 ✅
- e2e → Task 7 ✅
- Hors-scope (cross-tenant, full-text, phone) non implémentés ✅

**Placeholder scan:** seul le seeding d'événement du test e2e (Task 7) est délégué au harnais existant (comme #1/#2). Tout le reste contient le code complet.

**Type consistency:** `SearchResults` (Task 4) = forme renvoyée par `SearchService.search` (Task 1). `searchResultHref(kind, {id,eventId?})` cohérent entre header (Task 5) et page (Task 6). Clés i18n `search.*` (Task 3) consommées par Tasks 5–6. `mode: "insensitive" as const` requis pour le typage Prisma.
