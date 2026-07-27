# Chantier 1 — Annuaire public de découverte (opt-in) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un organisateur de rendre son event public et l'exposer dans un annuaire cross-tenant `/explore` (SEO inclus), sans jamais exposer d'event privé/non-ACTIVE ni de PII.

**Architecture:** Un booléen opt-in `publicListed` sur `Event` ; un endpoint public cross-tenant `GET /votes/public/discover` à projection whitelistée (tri `recent`/`popular`, `popular` = volume de votes payés) ; une page Next `/explore` + `sitemap.xml` dynamique ; un toggle dans les formulaires create/edit d'event.

**Tech Stack:** NestJS 11, Prisma/PostgreSQL, Zod, Next.js 15 (App Router), node:test (tests API contre `votezpro_test`), Playwright (E2E web).

## Global Constraints

- Montants entiers en plus petite unité ; devise implicite XOF (hors scope de ce chantier).
- Tests API contre une **vraie** base `votezpro_test` (aucun mock Prisma) ; harnais : `assertTestDatabase`, `resetDatabase`, `prisma` depuis `apps/api/src/test-utils/db.ts`.
- Nouveaux modèles/colonnes → migration Prisma via `packages/db/prisma/schema.prisma`.
- Isolation tenant stricte : `discover` est le **seul** endpoint cross-tenant public ; projection whitelistée uniquement ; jamais de PII votant ni de montants internes.
- Défaut de visibilité : **privé** (`publicListed = false`).
- Slugs/lookups en lowercase (`.toLowerCase()`), cohérent avec les méthodes publiques existantes.

---

### Task 1: Migration — colonnes de visibilité sur `Event`

**Files:**
- Modify: `packages/db/prisma/schema.prisma:150` (bloc `model Event`, avant `createdAt`)
- Create: `packages/db/prisma/migrations/<timestamp>_event_public_listing/migration.sql` (généré)

**Interfaces:**
- Produces: `Event.publicListed: boolean` (default `false`), `Event.publicListedAt: Date | null`, index `@@index([publicListed, status])`.

- [ ] **Step 1: Ajouter les champs au modèle `Event`**

Dans `packages/db/prisma/schema.prisma`, à l'intérieur de `model Event`, juste après la ligne `estimatedRevenueCfa      Int?` (et avant `createdAt`), insérer :

```prisma
  // Annuaire public opt-in (/explore). Défaut privé : l'organisateur doit activer.
  publicListed     Boolean  @default(false)
  publicListedAt   DateTime?
```

Puis ajouter, à côté de l'index existant `@@index([tenantId, status])` :

```prisma
  @@index([publicListed, status])
```

- [ ] **Step 2: Générer la migration**

Run: `npm run db:generate && npx --prefix packages/db prisma migrate dev --name event_public_listing --schema packages/db/prisma/schema.prisma`
Expected: migration créée, `Event` regénéré, DB dev à jour.

- [ ] **Step 3: Appliquer sur la base de test**

Run: `TEST_DATABASE_URL=postgresql://votezpro@localhost:5433/votezpro_test npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`
Expected: `All migrations have been successfully applied.`

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): Event.publicListed opt-in flag for public discovery"
```

---

### Task 2: API — create/update event accepte `publicListed`

**Files:**
- Modify: `apps/api/src/events/events.service.ts:32` (createEventSchema), `:97` (createEvent data), `:427` (updateEventSchema), `:447` (updateEvent data mapping)
- Test: `apps/api/src/events/events.service.test.ts`

**Interfaces:**
- Consumes: `Event.publicListed`, `Event.publicListedAt` (Task 1).
- Produces: `createEvent`/`updateEvent` acceptent `publicListed?: boolean`. Règle : passer `publicListed: true` pose `publicListedAt = now()` ; passer `false` remet `publicListedAt = null`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `apps/api/src/events/events.service.test.ts`, ajouter :

```ts
test("updateEvent active la visibilité publique et horodate", async () => {
  const { user, event } = await seedOwnerEvent(); // helper existant du fichier
  const updated = await events.updateEvent(user, event.id, { publicListed: true });
  assert.equal(updated.publicListed, true);
  assert.ok(updated.publicListedAt instanceof Date);

  const off = await events.updateEvent(user, event.id, { publicListed: false });
  assert.equal(off.publicListed, false);
  assert.equal(off.publicListedAt, null);
});
```

Si `seedOwnerEvent` n'existe pas dans ce fichier, réutiliser le helper de seed déjà présent (créer tenant + user owner + event via `EventsService.createEvent`).

- [ ] **Step 2: Lancer le test — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "active la visibilité publique"`
Expected: FAIL (`publicListed` ignoré / colonne non renseignée).

- [ ] **Step 3: Implémenter**

Dans `createEventSchema` (≈ ligne 32), ajouter le champ :

```ts
  publicListed: z.boolean().optional(),
```

Dans le `data` de `createEvent` (≈ ligne 130, après le mapping `layout`), ajouter :

```ts
          ...(input.publicListed !== undefined
            ? { publicListed: input.publicListed, publicListedAt: input.publicListed ? new Date() : null }
            : {}),
```

Dans `updateEventSchema` (≈ ligne 435, après `layout`), ajouter :

```ts
      publicListed: z.boolean().optional(),
```

Dans le mapping de `updateEvent` (≈ ligne 450, après `data.layout = input.layout`), ajouter :

```ts
    if (input.publicListed !== undefined) {
      data.publicListed = input.publicListed;
      data.publicListedAt = input.publicListed ? new Date() : null;
    }
```

- [ ] **Step 4: Lancer le test — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "active la visibilité publique"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/events/events.service.ts apps/api/src/events/events.service.test.ts
git commit -m "feat(api): events accept publicListed opt-in (sets publicListedAt)"
```

---

### Task 3: API — `discoverPublicEvents` service + route

**Files:**
- Modify: `apps/api/src/votes/votes.service.ts:24` (nouvelle méthode), `apps/api/src/votes/votes.controller.ts:8` (nouvelle route)
- Test: `apps/api/src/votes/votes.service.test.ts`

**Interfaces:**
- Consumes: `Event.publicListed`, `EventStatus.ACTIVE`, `prisma.vote.groupBy`.
- Produces:
  ```ts
  discoverPublicEvents(query: { q?: string; sort?: "recent" | "popular"; page?: number; pageSize?: number }): Promise<{
    items: Array<{ slug: string; title: string; tagline: string | null; logoUrl: string | null; brandColor: string | null; candidateCount: number; paidVoteCount: number }>;
    page: number; pageSize: number; total: number;
  }>
  ```
  Route : `GET /votes/public/discover?q=&sort=&page=&pageSize=`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `apps/api/src/votes/votes.service.test.ts`, ajouter :

```ts
test("discover ne renvoie que les events ACTIVE + publicListed", async () => {
  const t = await prisma.tenant.create({ data: { slug: "disc-t", displayName: "Disc" } });
  const base = { tenantId: t.id, startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 1000) };
  await prisma.event.create({ data: { ...base, slug: "disc-listed", title: "Listed", status: EventStatus.ACTIVE, publicListed: true } });
  await prisma.event.create({ data: { ...base, slug: "disc-private", title: "Private", status: EventStatus.ACTIVE, publicListed: false } });
  await prisma.event.create({ data: { ...base, slug: "disc-draft", title: "Draft", status: EventStatus.DRAFT, publicListed: true } });

  const res = await votes.discoverPublicEvents({});
  assert.equal(res.total, 1);
  assert.equal(res.items[0].slug, "disc-listed");
  // Projection whitelistée : aucune clé de PII/montant interne
  assert.deepEqual(Object.keys(res.items[0]).sort(), ["brandColor", "candidateCount", "logoUrl", "paidVoteCount", "slug", "tagline", "title"]);
});

test("discover sort=popular ordonne par votes payés", async () => {
  const t = await prisma.tenant.create({ data: { slug: "pop-t", displayName: "Pop" } });
  const mk = async (slug: string) => prisma.event.create({ data: { tenantId: t.id, slug, title: slug, status: EventStatus.ACTIVE, publicListed: true, startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 1000) } });
  const a = await mk("pop-a");
  const b = await mk("pop-b");
  const cand = async (eventId: string) => prisma.candidate.create({ data: { eventId, fullName: "C", number: 1, publicRef: generatePublicRef() } });
  const ca = await cand(a.id); const cb = await cand(b.id);
  // b a 2 votes payés, a en a 1 ; plus un vote non payé sur a (ignoré)
  await prisma.vote.create({ data: { eventId: a.id, candidateId: ca.id, amountCfa: 100, paidAt: new Date() } });
  await prisma.vote.create({ data: { eventId: a.id, candidateId: ca.id, amountCfa: 100, paidAt: null } });
  await prisma.vote.create({ data: { eventId: b.id, candidateId: cb.id, amountCfa: 100, paidAt: new Date() } });
  await prisma.vote.create({ data: { eventId: b.id, candidateId: cb.id, amountCfa: 100, paidAt: new Date() } });

  const res = await votes.discoverPublicEvents({ sort: "popular" });
  assert.deepEqual(res.items.map((i) => i.slug), ["pop-b", "pop-a"]);
  assert.equal(res.items.find((i) => i.slug === "pop-a")!.paidVoteCount, 1);
});
```

> Note : `Vote` peut exiger d'autres colonnes obligatoires (voir schéma). Aligner le `data` des `vote.create` sur les champs requis réels (mêmes que dans les tests de vote existants du fichier).

- [ ] **Step 2: Lancer — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "discover"`
Expected: FAIL (`discoverPublicEvents` n'existe pas).

- [ ] **Step 3: Implémenter le service**

Dans `apps/api/src/votes/votes.service.ts`, ajouter la méthode dans la classe `VotesService` :

```ts
  async discoverPublicEvents(query: {
    q?: string;
    sort?: "recent" | "popular";
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const q = query.q?.trim();

    const where = {
      status: EventStatus.ACTIVE,
      publicListed: true,
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { tagline: { contains: q, mode: "insensitive" as const } }] }
        : {})
    };

    const total = await this.prisma.event.count({ where });

    const events = await this.prisma.event.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        tagline: true,
        logoUrl: true,
        brandColor: true,
        publicListedAt: true,
        tenant: { select: { logoUrl: true, brandColor: true } },
        _count: { select: { candidates: true } }
      },
      orderBy: { publicListedAt: "desc" },
      // Pour sort=recent on pagine en base ; pour popular on trie après comptage.
      ...(query.sort === "popular" ? {} : { skip: (page - 1) * pageSize, take: pageSize })
    });

    const paid = await this.prisma.vote.groupBy({
      by: ["eventId"],
      where: { eventId: { in: events.map((e) => e.id) }, paidAt: { not: null }, cancelledAt: null },
      _count: { _all: true }
    });
    const paidByEvent = new Map(paid.map((p) => [p.eventId, p._count._all]));

    let items = events.map((e) => ({
      slug: e.slug,
      title: e.title,
      tagline: e.tagline,
      logoUrl: e.logoUrl ?? e.tenant.logoUrl,
      brandColor: e.brandColor ?? e.tenant.brandColor,
      candidateCount: e._count.candidates,
      paidVoteCount: paidByEvent.get(e.id) ?? 0
    }));

    if (query.sort === "popular") {
      items.sort((a, b) => b.paidVoteCount - a.paidVoteCount);
      items = items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    }

    return { items, page, pageSize, total };
  }
```

> `Vote.cancelledAt` : si le champ n'existe pas sous ce nom, retirer la clause (le filtre `paidAt: { not: null }` suffit à la définition « votes payés »). Vérifier dans le schéma avant d'implémenter.

- [ ] **Step 4: Exposer la route**

Dans `apps/api/src/votes/votes.controller.ts`, ajouter (avant la route `public/:tenantSlug/events` pour la lisibilité) :

```ts
  @Get("public/discover")
  discover(
    @Query("q") q?: string,
    @Query("sort") sort?: "recent" | "popular",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    return this.votesService.discoverPublicEvents({
      q,
      sort: sort === "popular" ? "popular" : "recent",
      page: page ? Number.parseInt(page, 10) : undefined,
      pageSize: pageSize ? Number.parseInt(pageSize, 10) : undefined
    });
  }
```

Et compléter l'import en tête de fichier :

```ts
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
```

- [ ] **Step 5: Lancer — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "discover"`
Expected: PASS (les 2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/votes/votes.service.ts apps/api/src/votes/votes.controller.ts apps/api/src/votes/votes.service.test.ts
git commit -m "feat(api): GET /votes/public/discover cross-tenant listing (recent/popular)"
```

---

### Task 4: Web — page `/explore`

**Files:**
- Create: `apps/web/app/explore/page.tsx`
- Create: `apps/web/lib/discover.ts` (fetch typé, si un dossier `lib` existe ; sinon inliner le fetch dans la page)

**Interfaces:**
- Consumes: `GET /api/v1/votes/public/discover` (Task 3).
- Produces: route publique `/explore` rendant une grille de cartes-events liées à `/e/{slug}`.

- [ ] **Step 1: Fetch typé**

Créer `apps/web/lib/discover.ts` (adapter le nom de la base URL API à la convention du repo, ex. `process.env.NEXT_PUBLIC_API_BASE_URL` ou l'helper existant utilisé par les autres pages publiques) :

```ts
export type DiscoverItem = {
  slug: string;
  title: string;
  tagline: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  candidateCount: number;
  paidVoteCount: number;
};

export async function fetchDiscover(sort: "recent" | "popular" = "recent"): Promise<DiscoverItem[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const res = await fetch(`${base}/api/v1/votes/public/discover?sort=${sort}`, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { items: DiscoverItem[] };
  return data.items;
}
```

> Vérifier comment `apps/web/app/e/[slug]/page.tsx` appelle l'API publique et **réutiliser exactement le même helper/base URL** plutôt que d'en réinventer un.

- [ ] **Step 2: Page `/explore`**

Créer `apps/web/app/explore/page.tsx` :

```tsx
import Link from "next/link";
import { fetchDiscover } from "../../lib/discover";

export const metadata = {
  title: "Explorer les concours — SHADOMA Votes",
  description: "Découvrez les concours et votes en cours sur SHADOMA Votes."
};

export default async function ExplorePage() {
  const items = await fetchDiscover("popular");
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Concours en cours</h1>
      {items.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Aucun concours public pour le moment.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/e/${e.slug}`}
                className="block rounded-xl border p-5 transition hover:shadow-md"
                style={e.brandColor ? { borderColor: e.brandColor } : undefined}
              >
                {e.logoUrl ? (
                  <img src={e.logoUrl} alt="" className="mb-3 h-10 w-10 rounded object-cover" />
                ) : null}
                <h2 className="font-medium">{e.title}</h2>
                {e.tagline ? <p className="mt-1 text-sm text-muted-foreground">{e.tagline}</p> : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {e.candidateCount} candidat(s) · {e.paidVoteCount} vote(s)
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

> Aligner les classes utilitaires sur le design system réel des pages `vp-*`/publiques (ne pas mélanger avec les primitives shadcn de l'app). Reprendre le style d'une carte existante de `/e/[slug]` si disponible.

- [ ] **Step 3: Vérifier le rendu**

Run: `npm --prefix apps/web run build`
Expected: build OK, route `/explore` listée.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/explore apps/web/lib/discover.ts
git commit -m "feat(web): /explore public discovery page"
```

---

### Task 5: Web — toggle « Lister publiquement » (create + edit)

**Files:**
- Modify: `apps/web/app/dashboard/events/new/page.tsx`
- Modify: `apps/web/app/dashboard/events/[eventId]/edit/page.tsx`

**Interfaces:**
- Consumes: champs `publicListed` de `createEvent`/`updateEvent` (Task 2).
- Produces: case à cocher envoyant `publicListed: boolean` dans le payload.

- [ ] **Step 1: Ajouter le champ au formulaire de création**

Dans `apps/web/app/dashboard/events/new/page.tsx`, repérer l'état de formulaire (là où `tagline`/`brandColor` sont gérés) et ajouter un booléen `publicListed` initialisé à `false`, un contrôle :

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={publicListed}
    onChange={(e) => setPublicListed(e.target.checked)}
  />
  Lister publiquement dans l'annuaire /explore
</label>
```

et inclure `publicListed` dans le corps envoyé à `POST /events`.

- [ ] **Step 2: Idem dans le formulaire d'édition**

Dans `apps/web/app/dashboard/events/[eventId]/edit/page.tsx`, initialiser `publicListed` depuis l'event chargé (`event.publicListed`), rendre le même contrôle, et inclure `publicListed` dans le `PATCH /events/:eventId`.

> Suivre exactement le pattern d'état/soumission déjà utilisé pour `tagline`/`brandColor` dans chaque page (mêmes helpers de fetch, mêmes conventions de nommage).

- [ ] **Step 3: Vérifier le build**

Run: `npm --prefix apps/web run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dashboard/events/new/page.tsx" "apps/web/app/dashboard/events/[eventId]/edit/page.tsx"
git commit -m "feat(web): organizer toggle to list an event publicly"
```

---

### Task 6: Web — `sitemap.xml` dynamique + OpenGraph

**Files:**
- Create: `apps/web/app/sitemap.ts`
- Modify: `apps/web/app/e/[slug]/page.tsx` (metadata OpenGraph par event) — uniquement si absent

**Interfaces:**
- Consumes: `fetchDiscover` (Task 4).
- Produces: `/sitemap.xml` listant `/explore` + chaque `/e/{slug}` public.

- [ ] **Step 1: Sitemap dynamique**

Créer `apps/web/app/sitemap.ts` :

```ts
import type { MetadataRoute } from "next";
import { fetchDiscover } from "../lib/discover";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shadoma.example";
  const events = await fetchDiscover("recent");
  return [
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.8 },
    ...events.map((e) => ({ url: `${base}/e/${e.slug}`, changeFrequency: "hourly" as const, priority: 0.6 }))
  ];
}
```

- [ ] **Step 2: OpenGraph par event (si manquant)**

Dans `apps/web/app/e/[slug]/page.tsx`, si `generateMetadata` n'expose pas déjà `openGraph`, l'ajouter (titre = titre de l'event, image = `logoUrl` si présent). Ne rien changer si déjà présent.

- [ ] **Step 3: Vérifier**

Run: `npm --prefix apps/web run build`
Expected: build OK, `/sitemap.xml` généré.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/sitemap.ts "apps/web/app/e/[slug]/page.tsx"
git commit -m "feat(web): dynamic sitemap + per-event OpenGraph for discovery"
```

---

### Task 7: E2E — toggle → annuaire → event

**Files:**
- Create: `apps/web/tests/e2e/discover.spec.ts`

**Interfaces:**
- Consumes: `/dashboard/events/...` (toggle), `/explore`, `/e/{slug}`.

- [ ] **Step 1: Écrire le scénario E2E**

Créer `apps/web/tests/e2e/discover.spec.ts` (reprendre l'auth/bootstrap des specs existantes, ex. `public-event.spec.ts`) :

```ts
import { test, expect } from "@playwright/test";

test("un event listé apparaît sur /explore et mène à sa page", async ({ page }) => {
  // Pré-requis : un organisateur connecté avec un event ACTIVE (réutiliser le helper d'auth existant).
  // 1) Activer la visibilité publique dans l'édition de l'event.
  // 2) Aller sur /explore.
  await page.goto("/explore");
  const card = page.getByRole("link", { name: /./ }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/e\//);
});
```

> Adapter le préambule (login + slug d'event actif) au harnais E2E réel du repo. Respecter `E2E_API_BASE_URL=:3011` (voir mémoire projet e2e-run-gotchas).

- [ ] **Step 2: Lancer l'E2E**

Run: `E2E_API_BASE_URL=http://localhost:3011 npm --prefix apps/web run test:e2e -- discover.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/discover.spec.ts
git commit -m "test(e2e): public discovery flow (toggle -> /explore -> event)"
```

---

## Self-Review

**Spec coverage (Chantier 1 de la spec 2026-07-05) :**
- `Event.publicListed` + `publicListedAt` → Task 1. ✅
- `GET /votes/public/discover` (cross-tenant, ACTIVE+listed, q/sort/page, projection whitelistée, tri popular = votes payés, pas de PII) → Task 3 (+ test d'assertion des clés). ✅
- Route web `/explore` + cartes brandées → Task 4. ✅
- Toggle organisateur (create + edit, défaut privé) → Tasks 2 & 5. ✅
- SEO sitemap + OpenGraph → Task 6. ✅
- Isolation : seul endpoint cross-tenant, colonnes whitelistées, exclusion non-ACTIVE/privé → Task 3 test. ✅

**Points à vérifier en cours d'implémentation (signalés inline) :**
- Nom exact du champ d'annulation de vote (`cancelledAt`) et colonnes requises de `Vote.create` — aligner sur le schéma réel avant Task 3.
- Helper de base URL API côté web — réutiliser celui de `/e/[slug]` plutôt que réinventer (Tasks 4/6).
- Classes de style — rester dans la couche `vp-*` publique, pas les primitives shadcn (Task 4).

**Type consistency :** `DiscoverItem` (web) = projection exacte renvoyée par `discoverPublicEvents` (api). `publicListed`/`publicListedAt` cohérents entre Tasks 1/2/3/5. ✅

**Hors périmètre de ce plan :** multi-devise (Chantier 2) et billetterie/PWA (Chantier 3) — plans séparés.
