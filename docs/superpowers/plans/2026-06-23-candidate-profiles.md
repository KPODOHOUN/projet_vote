# Candidate Profiles & Per-Candidate Sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque candidat une page profil publique (photo + nom + nombre de votes) servie par un lien partagé dédié `/e/{slug}/c/{number}`, où le vote se fait verrouillé sur ce candidat ; `/e/{slug}` devient un annuaire.

**Architecture:** Backend NestJS+Prisma : nouveau champ `Candidate.photoUrl`, tally PAID-only par candidat réutilisé, endpoint public étendu + nouvel endpoint par-candidat + PATCH candidat. Frontend Next.js App Router : hub annuaire, route profil `/e/[slug]/c/[number]` avec OG par candidat, flux de paiement extrait en hook partagé, formulaire verrouillé.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Zod, Next.js (App Router, server + client components), node:test (vraie DB), Playwright.

## Global Constraints

- ZERO fake data. TypeScript strict. Rester sur la couche publique `vp-*` (ne pas migrer vers shadcn) — voir `design-system-two-layers`.
- Tests API = **vraie DB** `votezpro_test` (pas de mock Prisma), pattern `assertTestDatabase`/`resetDatabase` de `apps/api/src/test-utils/db.ts`.
- e2e Playwright : `E2E_API_BASE_URL=http://localhost:3011` obligatoire + browsers headless-shell (voir `e2e-run-gotchas`).
- Photo Phase 1 = **URL** uniquement (`z.string().url().max(500)`). Upload = Phase 2, hors périmètre.
- Accent par-événement (`--vp-accent`) : jamais de texte sur l'accent brut ; placeholder = texte ink sur `color-mix(in srgb, var(--vp-accent) 14%, var(--vp-paper))`.
- Tally voteCount = **PAID-only** : `where: { eventId, cancelledAt: null, paidAt: { not: null } }` (même règle que `computeResults`).
- Message de commit : terminer par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Migration — `Candidate.photoUrl`

**Files:**
- Modify: `packages/db/prisma/schema.prisma:134-146` (model Candidate)
- Create: migration `packages/db/prisma/migrations/<timestamp>_candidate_photo_url/migration.sql`

**Interfaces:**
- Produces: colonne `Candidate.photoUrl text NULL` ; champ Prisma `photoUrl String?`.

- [ ] **Step 1: Modifier le schéma Prisma**

Dans `model Candidate`, ajouter après `fullName`:
```prisma
  fullName  String
  photoUrl  String?
  number    Int
```

- [ ] **Step 2: Générer + appliquer la migration (dev + test)**

Run:
```bash
cd packages/db && npx prisma migrate dev --name candidate_photo_url
DATABASE_URL="${DATABASE_URL/votezpro/votezpro_test}" npx prisma migrate deploy
```
Expected: migration créée et appliquée ; `npx prisma generate` régénère le client avec `photoUrl`.

- [ ] **Step 3: Vérifier le type généré**

Run: `cd packages/db && npx prisma generate && grep -n "photoUrl" node_modules/.prisma/client/index.d.ts | head -1`
Expected: `photoUrl: string | null` présent.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): Candidate.photoUrl (nullable)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Backend — photo requise à la création + tally helper + endpoint hub étendu

**Files:**
- Modify: `apps/api/src/events/events.service.ts:39-42` (createCandidateSchema), `:141-147` (create data)
- Modify: `apps/api/src/votes/votes.service.ts:93-130` (getPublicEventBySlug), ajout helper privé
- Test: `apps/api/src/votes/votes.service.test.ts`, `apps/api/src/events/events.service.test.ts` (si présent, sinon ajouter le cas dans votes via creation directe)

**Interfaces:**
- Consumes: `Candidate.photoUrl` (Task 1).
- Produces:
  - `createCandidateSchema` exige `photoUrl: z.string().url().max(500)` (requis).
  - `VotesService` privée `paidVoteCountByCandidate(eventId: string): Promise<Map<string, number>>`.
  - `getPublicEventBySlug` → `candidates: { id, fullName, number, photoUrl, voteCount }[]`.

- [ ] **Step 1: Écrire le test (hub étendu, PAID-only)**

Dans `votes.service.test.ts`, ajouter :
```ts
test("getPublicEventBySlug: expose photoUrl + voteCount PAID-only par candidat", async () => {
  const { event, candidate } = await seed();
  await prisma.candidate.update({ where: { id: candidate.id }, data: { photoUrl: "https://img.test/c7.jpg" } });
  // un vote NON payé ne compte pas
  await prisma.vote.create({ data: { tenantId: event.tenantId, eventId: event.id, candidateId: candidate.id, amountCfa: 500 } });
  // un vote payé compte
  await prisma.vote.create({ data: { tenantId: event.tenantId, eventId: event.id, candidateId: candidate.id, amountCfa: 500, paidAt: new Date() } });

  const payload = await votes.getPublicEventBySlug("vote-evt");
  const c = payload.candidates.find((x) => x.number === 7)!;
  assert.equal(c.photoUrl, "https://img.test/c7.jpg");
  assert.equal(c.voteCount, 1);
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `cd apps/api && npx tsx --test src/votes/votes.service.test.ts`
Expected: FAIL (`voteCount`/`photoUrl` undefined sur le candidat).

- [ ] **Step 3: Implémenter le helper + étendre l'endpoint**

Dans `votes.service.ts`, ajouter la méthode privée :
```ts
  /** candidateId → nombre de votes PAID (même règle d'intégrité que computeResults). */
  private async paidVoteCountByCandidate(eventId: string): Promise<Map<string, number>> {
    const grouped = await this.prisma.client.vote.groupBy({
      by: ["candidateId"],
      where: { eventId, cancelledAt: null, paidAt: { not: null } },
      _count: { _all: true }
    });
    return new Map(grouped.map((g) => [g.candidateId, g._count._all]));
  }
```
Puis dans `getPublicEventBySlug`, remplacer le `candidates` select + le retour :
```ts
    const candidates = await this.prisma.client.candidate.findMany({
      where: { eventId: event.id },
      select: { id: true, fullName: true, number: true, photoUrl: true },
      orderBy: { number: "asc" }
    });
    const counts = await this.paidVoteCountByCandidate(event.id);
```
et dans l'objet retourné, remplacer `candidates` par :
```ts
      candidates: candidates.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        number: c.number,
        photoUrl: c.photoUrl,
        voteCount: counts.get(c.id) ?? 0
      }))
```

- [ ] **Step 4: Rendre la photo requise à la création**

Dans `events.service.ts`, modifier `createCandidateSchema` :
```ts
const createCandidateSchema = z.object({
  fullName: z.string().min(2).max(160),
  number: z.number().int().positive(),
  photoUrl: z.string().url().max(500)
});
```
et le `candidate.create` data :
```ts
      data: {
        eventId: event.id,
        fullName: input.fullName,
        number: input.number,
        photoUrl: input.photoUrl
      }
```

- [ ] **Step 5: Lancer les tests → succès**

Run: `cd apps/api && npx tsx --test src/votes/votes.service.test.ts`
Expected: PASS (tous, dont le nouveau).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/events/events.service.ts apps/api/src/votes/votes.service.ts apps/api/src/votes/votes.service.test.ts
git commit -m "feat(api): candidate photoUrl required on create + hub exposes photoUrl & PAID voteCount

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Backend — endpoint public par-candidat

**Files:**
- Modify: `apps/api/src/votes/votes.service.ts` (nouvelle méthode `getPublicCandidate`)
- Modify: `apps/api/src/votes/votes.controller.ts:25-28` (nouvelle route)
- Test: `apps/api/src/votes/votes.service.test.ts`

**Interfaces:**
- Consumes: `paidVoteCountByCandidate` (Task 2).
- Produces: `getPublicCandidate(eventSlug: string, number: number)` → `{ organizer: {displayName,slug}, event: {slug,title,status,endsAt,branding}, candidate: {id,fullName,number,photoUrl,voteCount} }` ; throw `NotFoundException` si event ou candidat absent. Route `GET /votes/public/event/:eventSlug/candidate/:number`.

- [ ] **Step 1: Écrire le test**

```ts
test("getPublicCandidate: renvoie le candidat (photo+voteCount), 404 si absent", async () => {
  const { event, candidate } = await seed();
  await prisma.candidate.update({ where: { id: candidate.id }, data: { photoUrl: "https://img.test/c7.jpg" } });
  await prisma.vote.create({ data: { tenantId: event.tenantId, eventId: event.id, candidateId: candidate.id, amountCfa: 500, paidAt: new Date() } });

  const payload = await votes.getPublicCandidate("vote-evt", 7);
  assert.equal(payload.candidate.fullName, "Cand 7");
  assert.equal(payload.candidate.photoUrl, "https://img.test/c7.jpg");
  assert.equal(payload.candidate.voteCount, 1);
  assert.equal(payload.event.slug, "vote-evt");

  await assert.rejects(votes.getPublicCandidate("vote-evt", 999), /introuvable/);
  await assert.rejects(votes.getPublicCandidate("absent", 7), /introuvable/);
});
```

- [ ] **Step 2: Lancer → échec**

Run: `cd apps/api && npx tsx --test src/votes/votes.service.test.ts`
Expected: FAIL (`getPublicCandidate` n'existe pas).

- [ ] **Step 3: Implémenter la méthode**

Dans `votes.service.ts` :
```ts
  async getPublicCandidate(eventSlug: string, number: number) {
    const event = await this.prisma.client.event.findUnique({
      where: { slug: eventSlug.toLowerCase() },
      include: { tenant: { select: { displayName: true, slug: true, logoUrl: true, brandColor: true } } }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    const candidate = await this.prisma.client.candidate.findFirst({
      where: { eventId: event.id, number },
      select: { id: true, fullName: true, number: true, photoUrl: true }
    });
    if (!candidate) throw new NotFoundException("Candidat introuvable.");

    const counts = await this.paidVoteCountByCandidate(event.id);
    return {
      organizer: { displayName: event.tenant.displayName, slug: event.tenant.slug },
      event: {
        slug: event.slug,
        title: event.title,
        status: event.status,
        endsAt: event.endsAt,
        voteUnitPriceCfa: event.voteUnitPriceCfa,
        branding: {
          logoUrl: event.logoUrl ?? event.tenant.logoUrl,
          brandColor: event.brandColor ?? event.tenant.brandColor,
          tagline: event.tagline
        }
      },
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        number: candidate.number,
        photoUrl: candidate.photoUrl,
        voteCount: counts.get(candidate.id) ?? 0
      }
    } as const;
  }
```

- [ ] **Step 4: Ajouter la route contrôleur**

Dans `votes.controller.ts`, après `getPublicEventResults` :
```ts
  @Get("public/event/:eventSlug/candidate/:number")
  getPublicCandidate(@Param("eventSlug") eventSlug: string, @Param("number") number: string) {
    return this.votesService.getPublicCandidate(eventSlug, Number.parseInt(number, 10));
  }
```

- [ ] **Step 5: Lancer → succès + suite complète**

Run: `cd apps/api && npx tsx --test src/votes/votes.service.test.ts && npm test`
Expected: PASS (suite verte).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/votes/votes.service.ts apps/api/src/votes/votes.controller.ts apps/api/src/votes/votes.service.test.ts
git commit -m "feat(api): public per-candidate endpoint (profile data + OG)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Backend — PATCH candidat (photo des candidats existants)

**Files:**
- Modify: `apps/api/src/events/events.service.ts` (schéma + méthode `updateCandidate`)
- Modify: `apps/api/src/events/events.controller.ts:41-49` (nouvelle route PATCH)
- Test: `apps/api/src/votes/votes.service.test.ts` (réutilise prisma direct) ou test events dédié

**Interfaces:**
- Produces: `updateCandidate(user: AuthUser, eventId: string, candidateId: string, payload: unknown)` → candidat mis à jour ; throw `NotFoundException` si hors tenant. Schéma `{ fullName?, photoUrl? }`. Route `PATCH /events/:eventId/candidates/:candidateId`.

- [ ] **Step 1: Écrire le test (isolation tenant)**

Dans `votes.service.test.ts`, ajouter (importer `EventsService`, `PrivacyConsentService`, `NotificationsService` si nécessaire ; sinon créer `events.service.test.ts` avec le bootstrap standard) :
```ts
test("updateCandidate: met à jour photoUrl, refuse hors tenant", async () => {
  const { tenant, event, candidate } = await seed();
  const events = new EventsService(prismaService, votes, /* notifications */ undefined as any);
  const owner = { userId: "u1", tenantId: tenant.id, role: "ORGANIZER_OWNER" } as any;
  await events.updateCandidate(owner, event.id, candidate.id, { photoUrl: "https://img.test/new.jpg" });
  const row = await prisma.candidate.findUnique({ where: { id: candidate.id } });
  assert.equal(row?.photoUrl, "https://img.test/new.jpg");

  const intruder = { userId: "u2", tenantId: "other-tenant", role: "ORGANIZER_OWNER" } as any;
  await assert.rejects(events.updateCandidate(intruder, event.id, candidate.id, { photoUrl: "https://x" }), /introuvable/);
});
```
> Note : `NotificationsService` n'est pas utilisé par `updateCandidate` ; passer un stub. Vérifier le constructeur réel de `EventsService` (3 args : prisma, votesService, notifications) et adapter.

- [ ] **Step 2: Lancer → échec**

Run: `cd apps/api && npx tsx --test src/votes/votes.service.test.ts`
Expected: FAIL (`updateCandidate` n'existe pas).

- [ ] **Step 3: Implémenter schéma + méthode**

Dans `events.service.ts`, ajouter près de `createCandidateSchema` :
```ts
const updateCandidateSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  photoUrl: z.string().url().max(500).optional()
});
```
et la méthode (après `createCandidate`) :
```ts
  async updateCandidate(user: AuthUser, eventId: string, candidateId: string, payload: unknown) {
    const event = await this.prisma.client.event.findFirst({ where: { id: eventId, tenantId: user.tenantId } });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    const input = updateCandidateSchema.parse(payload);
    const existing = await this.prisma.client.candidate.findFirst({ where: { id: candidateId, eventId: event.id } });
    if (!existing) throw new NotFoundException("Candidat introuvable.");
    return this.prisma.client.candidate.update({
      where: { id: candidateId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {})
      }
    });
  }
```

- [ ] **Step 4: Ajouter la route contrôleur**

Dans `events.controller.ts`, après `createCandidate` :
```ts
  @Patch(":eventId/candidates/:candidateId")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  updateCandidate(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("candidateId") candidateId: string,
    @Body() body: unknown
  ) {
    return this.eventsService.updateCandidate(user, eventId, candidateId, body);
  }
```

- [ ] **Step 5: Lancer → succès + suite**

Run: `cd apps/api && npx tsx --test src/votes/votes.service.test.ts && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/events apps/api/src/votes/votes.service.test.ts
git commit -m "feat(api): PATCH candidate (photoUrl/fullName), tenant-scoped

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — composant `CandidatePhoto` (photo ou initiales) + CSS

**Files:**
- Create: `apps/web/components/candidate-photo.tsx`
- Modify: `apps/web/app/globals.css` (après le bloc `.vp-candidate-*`, ~ligne 3120)

**Interfaces:**
- Produces: `CandidatePhoto({ photoUrl, fullName, size }: { photoUrl: string | null; fullName: string; size: "sm" | "lg" })` — `<img>` avec fallback initiales `onError`/absence.

- [ ] **Step 1: Écrire le composant**

```tsx
"use client";
import { useState } from "react";

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function CandidatePhoto({ photoUrl, fullName, size }: { photoUrl: string | null; fullName: string; size: "sm" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const cls = `vp-candidate-photo vp-candidate-photo-${size}`;
  if (!photoUrl || broken) {
    return <span className={cls} data-placeholder="true" aria-hidden="true">{initials(fullName)}</span>;
  }
  return <img className={cls} src={photoUrl} alt="" loading="lazy" onError={() => setBroken(true)} />;
}
```

- [ ] **Step 2: Ajouter le CSS**

Dans `globals.css` :
```css
.vp-candidate-photo {
  display: grid;
  place-items: center;
  aspect-ratio: 1 / 1;
  width: 100%;
  border-radius: var(--vp-radius-md);
  object-fit: cover;
  background: color-mix(in srgb, var(--vp-accent, var(--vp-blue-500)) 14%, var(--vp-paper));
  color: var(--vp-text);
  font-family: var(--vp-font-display);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.vp-candidate-photo-sm { max-width: 96px; font-size: 28px; }
.vp-candidate-photo-lg { max-width: 320px; font-size: 64px; }
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/candidate-photo.tsx apps/web/app/globals.css
git commit -m "feat(web): CandidatePhoto component (img + initials fallback)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — extraire le flux de paiement en hook `usePublicVotePayment`

**Files:**
- Create: `apps/web/app/e/[slug]/use-public-vote-payment.ts`
- (référence: logique actuelle dans `apps/web/app/e/[slug]/EventVoteClient.tsx`)

**Interfaces:**
- Produces:
```ts
type VoteStatus = { phase: "idle" | "submitting" | "tracking"; result: { transactionId: string; provider: string; status: string } | null; live: { status: string; providerRef: string | null } | null; error: string };
function usePublicVotePayment(opts: { tenantSlug: string; eventSlug: string; isEn: boolean }): {
  status: VoteStatus;
  submit: (args: { candidateNumber: number; amountCfa: number; voterPhone: string }) => Promise<void>;
  reset: () => void;
};
```

- [ ] **Step 1: Écrire le hook (déplacer la logique existante)**

Copier intégralement depuis `EventVoteClient.tsx` : `handleSubmit` (consent→cast→init), le `useEffect` SSE+polling, les états `paymentResult`/`livePaymentStatus`/`error`/`isSubmitting`. Exposer `submit`/`status`/`reset`. Garder la logique **à l'identique** (mêmes endpoints, même fallback). Fichier `"use client"`-compatible (hook React, pas de directive nécessaire dans un module importé par un composant client).

```ts
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
// ... (types CastVoteResponse, InitPublicPaymentResponse, PublicPaymentStatusResponse identiques à l'actuel)
export function usePublicVotePayment(opts: { tenantSlug: string; eventSlug: string; isEn: boolean }) {
  const { tenantSlug, eventSlug, isEn } = opts;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentResult, setPaymentResult] = useState<InitPublicPaymentResponse | null>(null);
  const [livePaymentStatus, setLivePaymentStatus] = useState<PublicPaymentStatusResponse | null>(null);
  const [voterPhone, setVoterPhone] = useState("");

  async function submit(args: { candidateNumber: number; amountCfa: number; voterPhone: string }) {
    setError(""); setPaymentResult(null); setLivePaymentStatus(null); setIsSubmitting(true); setVoterPhone(args.voterPhone);
    try {
      await apiFetch("/privacy/consent", { method: "POST", body: JSON.stringify({ tenantSlug, eventSlug, voterPhone: args.voterPhone }) });
      const vote = await apiFetch<CastVoteResponse>("/votes/cast", { method: "POST", body: JSON.stringify({ tenantSlug, eventSlug, candidateNumber: args.candidateNumber, amountCfa: args.amountCfa, voterPhone: args.voterPhone }) });
      const idempotencyKey = `public-${vote.id}-${Date.now()}`;
      const payment = await apiFetch<InitPublicPaymentResponse>("/payments/public/init", { method: "POST", body: JSON.stringify({ tenantSlug, eventSlug, voteId: vote.id, amountCfa: args.amountCfa, idempotencyKey, requestFingerprint: args.voterPhone }) });
      setPaymentResult(payment);
      setLivePaymentStatus({ transactionId: payment.transactionId, status: payment.status, provider: payment.provider, providerRef: null, updatedAt: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : isEn ? "Vote failed." : "Le vote a échoué.");
    } finally { setIsSubmitting(false); }
  }

  function reset() { setPaymentResult(null); setLivePaymentStatus(null); setError(""); }

  useEffect(() => {
    // ... COPIER le useEffect SSE+polling existant (lignes 92-173 de EventVoteClient),
    // en remplaçant les setLivePaymentStatus/setError tels quels ; deps [paymentResult, tenantSlug, eventSlug, voterPhone].
  }, [paymentResult, tenantSlug, eventSlug, voterPhone]);

  return { status: { phase: isSubmitting ? "submitting" : paymentResult ? "tracking" : "idle", result: paymentResult, live: livePaymentStatus, error } as const, submit, reset };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/e/[slug]/use-public-vote-payment.ts
git commit -m "refactor(web): extract usePublicVotePayment hook from EventVoteClient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — profil candidat `/e/[slug]/c/[number]` + vote verrouillé

**Files:**
- Create: `apps/web/app/e/[slug]/c/[number]/page.tsx`
- Create: `apps/web/app/e/[slug]/c/[number]/CandidateVoteClient.tsx`
- Modify: `apps/web/app/e/[slug]/page.tsx` (exporter le type `PublicCandidate` enrichi — voir Task 8)

**Interfaces:**
- Consumes: `usePublicVotePayment` (Task 6), `CandidatePhoto` (Task 5), endpoint `GET /votes/public/event/:slug/candidate/:number` (Task 3).
- Produces: route profil + OG par candidat.

- [ ] **Step 1: Écrire `CandidateVoteClient` (vote verrouillé + suivi humanisé)**

```tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../../../../lib/i18n-provider";
import { usePublicVotePayment } from "../../use-public-vote-payment";

type Props = { organizerSlug: string; eventSlug: string; candidateNumber: number; candidateName: string; voteUnitPriceCfa: number | null; initialVoteCount: number };

export function CandidateVoteClient({ organizerSlug, eventSlug, candidateNumber, candidateName, voteUnitPriceCfa, initialVoteCount }: Props) {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const { status, submit, reset } = usePublicVotePayment({ tenantSlug: organizerSlug, eventSlug, isEn });
  const [amountCfa, setAmountCfa] = useState(voteUnitPriceCfa ?? 100);
  const [voterPhone, setVoterPhone] = useState("");
  const [hasConsented, setHasConsented] = useState(false);

  const liveStatus = (status.live?.status ?? status.result?.status ?? "").toUpperCase();
  const isDone = liveStatus === "SUCCEEDED";
  const canSubmit = amountCfa > 0 && voterPhone.trim().length >= 8 && hasConsented && status.phase !== "submitting";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submit({ candidateNumber, amountCfa, voterPhone });
  }

  return (
    <>
      <p className="vp-vote-count"><strong>{(initialVoteCount + (isDone ? 1 : 0)).toLocaleString(isEn ? "en-GB" : "fr-FR")}</strong> {isEn ? "votes" : "votes"}</p>
      <form className="vp-form" onSubmit={onSubmit}>
        {voteUnitPriceCfa !== null ? (
          <div className="vp-fixed-amount">
            <span className="vp-fixed-amount-label">{isEn ? "Price per vote" : "Prix du vote"}</span>
            <span className="vp-fixed-amount-value">{voteUnitPriceCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF</span>
          </div>
        ) : (
          <label>{isEn ? "Amount (XOF)" : "Montant (XOF)"}
            <input type="number" min={100} step={50} value={amountCfa} onChange={(e) => setAmountCfa(Number(e.target.value))} required />
          </label>
        )}
        <label>{isEn ? "Voter phone number" : "Téléphone du votant"}
          <input value={voterPhone} onChange={(e) => setVoterPhone(e.target.value)} placeholder="229XXXXXXXX" required />
        </label>
        <label className="vp-checkbox">
          <input type="checkbox" checked={hasConsented} onChange={(e) => setHasConsented(e.target.checked)} required />
          <span>{isEn ? "I accept the " : "J'accepte la "}<Link href="/privacy" target="_blank" rel="noopener noreferrer" className="vp-link-secondary">{isEn ? "privacy policy" : "politique de confidentialité"}</Link>.</span>
        </label>
        <button type="submit" className="vp-vote-cta" disabled={!canSubmit}>
          {status.phase === "submitting" ? (isEn ? "Processing…" : "Traitement…") : `${isEn ? "Vote for" : "Voter pour"} ${candidateName} · ${amountCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF`}
        </button>
      </form>

      {status.error ? <p className="vp-error" role="alert">{status.error}</p> : null}

      {status.result ? (
        <section className="vp-vote-status" aria-live="polite">
          <p className="vp-vote-status-title">{isEn ? "Vote recorded" : "Vote enregistré"}</p>
          {!isDone && liveStatus !== "FAILED" ? (
            <p className="vp-vote-status-line vp-vote-status-pending"><span className="vp-vote-dot" aria-hidden="true" />{isEn ? "Confirm the payment on your phone — we’ll update this as soon as it goes through." : "Confirme le paiement sur ton téléphone — ça se met à jour dès que c’est validé."}</p>
          ) : null}
          {isDone ? <p className="vp-vote-status-line vp-vote-status-ok"><span aria-hidden="true">✓</span> {isEn ? `Vote confirmed for ${candidateName}. Thank you!` : `Vote confirmé pour ${candidateName}. Merci !`}</p> : null}
          {liveStatus === "FAILED" ? (<><p className="vp-vote-status-line vp-vote-status-ko" role="alert">{isEn ? "The payment didn’t go through. You can try again." : "Le paiement n’a pas abouti. Tu peux réessayer."}</p><button type="button" className="vp-link-secondary" onClick={reset}>{isEn ? "Try again" : "Réessayer"}</button></>) : null}
          <p className="vp-vote-status-ref">{isEn ? "Reference" : "Référence"}: {status.live?.providerRef ?? status.result.transactionId}</p>
        </section>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Écrire la page profil (SSR + OG par candidat)**

```tsx
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "../../../../../components/candidate-photo";
import { CandidateVoteClient } from "./CandidateVoteClient";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

type CandidateProfile = {
  organizer: { displayName: string; slug: string };
  event: { slug: string; title: string; status: string; endsAt: string; voteUnitPriceCfa: number | null; branding: { logoUrl: string | null; brandColor: string | null; tagline: string | null } };
  candidate: { id: string; fullName: string; number: number; photoUrl: string | null; voteCount: number };
};

async function fetchCandidate(slug: string, number: string): Promise<CandidateProfile | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/votes/public/event/${encodeURIComponent(slug)}/candidate/${encodeURIComponent(number)}`, { cache: "no-store", headers: { "Content-Type": "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as CandidateProfile;
  } catch { return null; }
}

type PageProps = { params: Promise<{ slug: string; number: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, number } = await params;
  const data = await fetchCandidate(slug, number);
  if (!data) return { title: "Candidat introuvable · VotezPro", robots: { index: false, follow: false } };
  const { candidate, event } = data;
  const title = `${candidate.fullName} · ${event.title}`;
  const description = `Votez pour ${candidate.fullName} (n°${candidate.number}) au concours « ${event.title} ».`;
  const url = `/e/${event.slug}/c/${candidate.number}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "VotezPro", type: "website", ...(candidate.photoUrl ? { images: [{ url: candidate.photoUrl }] } : event.branding.logoUrl ? { images: [{ url: event.branding.logoUrl }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(candidate.photoUrl ? { images: [candidate.photoUrl] } : {}) }
  };
}

export default async function CandidateProfilePage({ params }: PageProps) {
  const { slug, number } = await params;
  const data = await fetchCandidate(slug, number);
  if (!data) notFound();
  const { organizer, event, candidate } = data;
  const brandColor = event.branding.brandColor;
  const accent = brandColor && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(brandColor) ? brandColor : null;
  const isOpen = event.status === "ACTIVE";

  return (
    <main className="vp-shell vp-shell-top">
      <section className="vp-card vp-card-wide" style={accent ? ({ "--vp-accent": accent } as CSSProperties) : undefined}>
        <header className="vp-page-head">
          <div className="vp-inline">
            <Link href={`/e/${event.slug}`} className="vp-link-secondary">← {event.title}</Link>
            <Link href={`/e/${event.slug}/results`} className="vp-link-secondary">Résultats en direct →</Link>
          </div>
          <span className="vp-eyebrow-pill">#{candidate.number}</span>
          <h1 className="vp-page-title">{candidate.fullName}</h1>
        </header>
        <CandidatePhoto photoUrl={candidate.photoUrl} fullName={candidate.fullName} size="lg" />
        {isOpen ? (
          <CandidateVoteClient organizerSlug={organizer.slug} eventSlug={event.slug} candidateNumber={candidate.number} candidateName={candidate.fullName} voteUnitPriceCfa={event.voteUnitPriceCfa} initialVoteCount={candidate.voteCount} />
        ) : (
          <div className="vp-empty-state"><h2>Le vote n’est pas ouvert</h2><p className="vp-muted">Ce concours est « {event.status} ».</p></div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && npm run typecheck && npm run build`
Expected: PASS ; route `/e/[slug]/c/[number]` listée.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/e/[slug]/c
git commit -m "feat(web): candidate profile page (/e/[slug]/c/[number]) with locked vote + per-candidate OG

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — hub `/e/[slug]` devient annuaire

**Files:**
- Modify: `apps/web/app/e/[slug]/page.tsx` (type `PublicCandidate` enrichi + grille de liens, suppression du form)
- Delete: `apps/web/app/e/[slug]/EventVoteClient.tsx` (logique déplacée en hook + CandidateVoteClient)

**Interfaces:**
- Consumes: endpoint hub étendu (Task 2), `CandidatePhoto` (Task 5).
- Produces: `PublicCandidate = { id; fullName; number; photoUrl: string | null; voteCount: number }`.

- [ ] **Step 1: Mettre à jour les types + le rendu du hub**

Dans `page.tsx`, remplacer le type `PublicCandidate` :
```ts
export type PublicCandidate = { id: string; fullName: string; number: number; photoUrl: string | null; voteCount: number };
```
Remplacer le bloc `isOpen ? <EventVoteClient/> : <empty>` par une grille de liens (toujours visible, même hors ACTIVE — l'annuaire reste consultable) :
```tsx
import { CandidatePhoto } from "../../../components/candidate-photo";
// ...
{candidates.length === 0 ? (
  <div className="vp-empty-state"><h2>Aucun candidat</h2><p className="vp-muted">Aucun candidat inscrit pour le moment.</p></div>
) : (
  <div className="vp-candidate-grid" role="list">
    {candidates.map((c) => (
      <Link key={c.id} href={`/e/${event.slug}/c/${c.number}`} className="vp-candidate-card" role="listitem">
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" />
        <span className="vp-candidate-number">{String(c.number).padStart(2, "0")}</span>
        <span className="vp-candidate-name">{c.fullName}</span>
        <span className="vp-candidate-votes">{c.voteCount.toLocaleString("fr-FR")} votes</span>
      </Link>
    ))}
  </div>
)}
```
> Conserver le `style={accent ? ...}` déjà présent sur la `.vp-card`. Retirer l'import + l'usage de `EventVoteClient`. Le `.vp-candidate-card` est désormais un `<a>` (Link) : ajouter `text-decoration:none; color:inherit;` au CSS de `.vp-candidate-card` si besoin (vérifier le rendu).

- [ ] **Step 2: Supprimer EventVoteClient + ajouter le CSS votes**

Run: `git rm apps/web/app/e/[slug]/EventVoteClient.tsx`
Dans `globals.css`, ajouter :
```css
.vp-candidate-card { text-decoration: none; color: inherit; }
.vp-candidate-votes { font-size: 13px; font-weight: 600; color: var(--vp-text-muted, var(--vp-text)); }
.vp-vote-count { font-size: 15px; color: var(--vp-text); }
.vp-vote-count strong { font-family: var(--vp-font-display); font-size: 22px; }
```

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && npm run typecheck && npm run build`
Expected: PASS ; aucune référence restante à `EventVoteClient`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/e/[slug]/page.tsx apps/web/app/globals.css
git commit -m "feat(web): /e/[slug] hub becomes a candidate directory linking to profiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Frontend — dashboard candidats : champ photo (création + édition)

**Files:**
- Modify: `apps/web/app/dashboard/events/[eventId]/candidates/page.tsx`

**Interfaces:**
- Consumes: `POST /events/:id/candidates` (photoUrl requis, Task 2), `PATCH /events/:id/candidates/:candidateId` (Task 4).
- Produces: champ Photo (URL) requis à la création + édition par ligne.

- [ ] **Step 1: Ajouter le state + champ photo à la création**

Dans `candidates/page.tsx` : étendre le type `Candidate` avec `photoUrl: string | null` ; ajouter `const [photoUrl, setPhotoUrl] = useState("")` ; ajouter un `<Input id="photoUrl" label={isEn ? "Photo URL" : "URL de la photo"} type="url" value={photoUrl} onChange=... required />` dans le `<form>` ; inclure `photoUrl` dans le body POST :
```ts
        body: JSON.stringify({ fullName, number, photoUrl })
```
et reset `setPhotoUrl("")` après succès.

- [ ] **Step 2: Ajouter l'édition de photo par ligne**

Dans le rendu de chaque candidat, ajouter à côté du nom une mini-vignette + un bouton « Modifier la photo » qui ouvre un champ URL inline et appelle :
```ts
const onUpdatePhoto = async (candidateId: string, url: string) => {
  const token = getStoredToken(); if (!token) { router.push("/login"); return; }
  await apiFetch(`/events/${eventId}/candidates/${candidateId}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ photoUrl: url }) });
  await loadCandidates(token);
};
```
Afficher la vignette via `CandidatePhoto` (`size="sm"`).

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/events/[eventId]/candidates/page.tsx
git commit -m "feat(web): candidate photo URL field (create) + inline photo edit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: e2e Playwright — lien partagé → profil → vote

**Files:**
- Create/Modify: `apps/web/e2e/candidate-profile.spec.ts`

**Interfaces:**
- Consumes: toute la chaîne (Tasks 1-9). Stack e2e lancée avec `E2E_API_BASE_URL=http://localhost:3011`.

- [ ] **Step 1: Écrire le test e2e (seed via API, navigation, vote locked)**

Mirror les specs e2e existantes (invitations/notifications). Le test : seed un event ACTIVE + 1 candidat avec photoUrl via l'API de test ; visiter `/e/{slug}` → vérifier la carte candidat (nom + « votes ») ; cliquer → arriver sur `/e/{slug}/c/{number}` ; vérifier le nom dans le `<h1>` + le CTA « Voter pour {nom} » ; remplir téléphone + consentement + soumettre → vérifier l'apparition du bloc `.vp-vote-status` (« Vote enregistré »).

```ts
import { test, expect } from "@playwright/test";
// ... seed helper API (réutiliser l'utilitaire e2e existant) ...
test("shared candidate link → profile → locked vote", async ({ page }) => {
  // const { slug, number, name } = await seedEventWithCandidate({ photoUrl: "https://img.test/c.jpg" });
  await page.goto(`/e/${slug}`);
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: name }).click();
  await expect(page).toHaveURL(new RegExp(`/e/${slug}/c/${number}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await page.getByLabel(/Téléphone|phone/i).fill("22990000001");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: new RegExp(`Voter pour ${name}|Vote for ${name}`) }).click();
  await expect(page.getByText(/Vote enregistré|Vote recorded/)).toBeVisible();
});
```

- [ ] **Step 2: Lancer le test e2e**

Run: `cd apps/web && E2E_API_BASE_URL=http://localhost:3011 npx playwright test candidate-profile.spec.ts`
Expected: PASS (1/1).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/candidate-profile.spec.ts
git commit -m "test(web): e2e shared candidate link → profile → locked vote

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage :** B1→T1 · B2(create+tally+hub)→T2 · B3(endpoint candidat)→T3 · édition candidat (manquait dans la spec, ajouté car nécessaire aux candidats existants)→T4 · F4(placeholder)→T5 · F3(hook)→T6 · F2(profil+OG)→T7 · F1(hub annuaire)→T8 · F5(dashboard)→T9 · tests→T2/T3/T4/T10. ✅

**Écart spec assumé :** la spec mentionnait l'« édition » candidat comme si elle existait — elle n'existe pas. T4 ajoute un PATCH minimal (sinon les candidats existants ne pourraient jamais recevoir de photo). Mettre à jour la spec si nécessaire.

**Placeholders :** aucun « TODO/TBD » ; les seuls extraits à compléter à l'identique sont explicitement marqués « COPIER depuis EventVoteClient » (T6 useEffect) — code source existant, pas une invention.

**Cohérence des types :** `photoUrl: string | null`, `voteCount: number`, `paidVoteCountByCandidate(eventId)→Map<string,number>`, `getPublicCandidate(eventSlug, number)`, `usePublicVotePayment({tenantSlug,eventSlug,isEn})→{status,submit,reset}`, `CandidatePhoto({photoUrl,fullName,size})` — cohérents entre tâches consommatrices/productrices.

## Ordre & dépendances

T1 → T2 → T3, T4 (backend). T5, T6 indépendants (frontend socle). T7 dépend de T5+T6+T3. T8 dépend de T5+T2. T9 dépend de T4+T5. T10 dépend de tout. Ordre recommandé : 1,2,3,4,5,6,7,8,9,10.
