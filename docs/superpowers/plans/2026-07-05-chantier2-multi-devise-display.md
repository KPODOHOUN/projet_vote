# Chantier 2 — Multi-devise « display » (fondation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'affichage des montants multi-devise (devise par event, formatage centralisé) et introduire la devise dans le modèle, **sans** changer les PSP (V1 encaisse toujours en XOF).

**Architecture:** Un value object `Money` + `formatMoney()` dans `packages/shared` comme SSOT du formatage ; une colonne `currency` sur `Event` (source de vérité des prix de l'event, défaut `XOF`) ; un garde-fou à l'init paiement qui refuse toute devise non encaissable (V1 : seule `XOF` encaissable) ; remplacement des `.toLocaleString(...) + "XOF"/"FCFA"/"CFA"` épars du frontend par `formatMoney()`.

**Tech Stack:** TypeScript strict, `packages/shared`, NestJS 11, Prisma/PostgreSQL, Zod, Next.js 15, node:test.

## Global Constraints

- **Display-only** : aucun nouveau PSP, aucune conversion FX, aucun encaissement en devise ≠ XOF. On modélise et on affiche.
- Montants stockés en **entier plus petite unité** (`amountCfa` legacy = `amountMinor`). On **ne renomme pas** les colonnes.
- Exposant par devise via une table (`XOF = 0` décimale). `formatMoney` est le **seul** point de formatage monétaire côté web (plus de `" XOF"`/`" FCFA"`/`" CFA"` concaténés à la main).
- Encaissable V1 : `ENCASHABLE_CURRENCIES = ["XOF"]`. Toute init de paiement pour un event dont la devise n'est pas encaissable → `400`.
- Tests API contre la vraie base `votezpro_test` (harnais `assertTestDatabase`/`resetDatabase`/`prisma`).
- Défaut devise = `"XOF"` partout (aucune régression sur les montants existants).

---

### Task 1: Shared — `Money`, `formatMoney`, `currencyExponent`

**Files:**
- Create: `packages/shared/src/money.ts`
- Modify: `packages/shared/src/index.ts` (ré-export)
- Test: `packages/shared/src/money.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Money = { amountMinor: number; currency: string };
  function currencyExponent(currency: string): number;   // XOF -> 0, EUR/USD -> 2, défaut 2
  function formatMoney(money: Money, locale?: string): string; // ex. "1 000 FCFA" / "12,50 €"
  ```

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `packages/shared/src/money.test.ts` :

```ts
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { currencyExponent, formatMoney } from "./money";

test("currencyExponent: XOF sans décimale, EUR à 2", () => {
  assert.equal(currencyExponent("XOF"), 0);
  assert.equal(currencyExponent("EUR"), 2);
  assert.equal(currencyExponent("ZZZ"), 2); // défaut prudent
});

test("formatMoney: XOF entier, pas de décimale", () => {
  const out = formatMoney({ amountMinor: 1000, currency: "XOF" }, "fr-FR");
  assert.match(out, /1\s?000/);
  assert.doesNotMatch(out, /,\d/); // pas de décimales pour XOF
});

test("formatMoney: EUR convertit minor->major (1250 -> 12,50)", () => {
  const out = formatMoney({ amountMinor: 1250, currency: "EUR" }, "fr-FR");
  assert.match(out, /12[.,]50/);
});
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `node --test packages/shared/src/money.test.ts` (ou la commande de test du package shared si elle diffère — vérifier `packages/shared/package.json`)
Expected: FAIL (`./money` introuvable).

- [ ] **Step 3: Implémenter**

Créer `packages/shared/src/money.ts` :

```ts
export type Money = { amountMinor: number; currency: string };

// Exposant (décimales) par devise. Étendre au fil des devises supportées.
const EXPONENTS: Record<string, number> = {
  XOF: 0,
  XAF: 0,
  EUR: 2,
  USD: 2
};

export function currencyExponent(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function formatMoney(money: Money, locale = "fr-FR"): string {
  const exp = currencyExponent(money.currency);
  const major = money.amountMinor / 10 ** exp;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp
    }).format(major);
  } catch {
    // Devise inconnue d'Intl : repli lisible.
    return `${major.toLocaleString(locale, { minimumFractionDigits: exp, maximumFractionDigits: exp })} ${money.currency}`;
  }
}
```

Dans `packages/shared/src/index.ts`, ajouter :

```ts
export * from "./money";
```

- [ ] **Step 4: Lancer — doit passer**

Run: `node --test packages/shared/src/money.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/money.ts packages/shared/src/money.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): Money value object + formatMoney (currency-aware, XOF 0 decimals)"
```

---

### Task 2: DB — `Event.currency`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (bloc `model Event`)
- Create: `packages/db/prisma/migrations/<timestamp>_event_currency/migration.sql` (généré)

**Interfaces:**
- Produces: `Event.currency: string` (default `"XOF"`).

- [ ] **Step 1: Ajouter le champ**

Dans `model Event`, juste après `voteUnitPriceCfa Int?`, ajouter :

```prisma
  // Devise d'affichage des prix de l'event (ISO 4217). V1 : seule XOF est encaissable.
  currency         String   @default("XOF")
```

- [ ] **Step 2: Générer + appliquer (dev & test)**

Run: `npm run db:generate && npx prisma migrate dev --name event_currency --schema packages/db/prisma/schema.prisma`
Run (test): `TEST_DATABASE_URL=postgresql://votezpro@localhost:5433/votezpro_test npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`
Expected: migration appliquée sur les deux bases.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): Event.currency (default XOF) for multi-currency display"
```

---

### Task 3: API — accepter `currency` à la création/édition d'event

**Files:**
- Modify: `apps/api/src/events/events.service.ts` (createEventSchema, createEvent data, updateEventSchema, updateEvent mapping)
- Test: `apps/api/src/events/events.service.test.ts`

**Interfaces:**
- Consumes: `Event.currency` (Task 2).
- Produces: `createEvent`/`updateEvent` acceptent `currency?: string` (validation ISO 4217 basique : 3 lettres majuscules).

- [ ] **Step 1: Écrire le test qui échoue**

Dans `apps/api/src/events/events.service.test.ts` :

```ts
test("createEvent enregistre la devise fournie (défaut XOF)", async () => {
  const { user } = await seedOwner(); // helper existant : tenant + user owner
  const evt = await events.createEvent(user, {
    title: "Gala Devise", slug: "gala-devise",
    startsAt: new Date(Date.now() + 1000).toISOString(),
    endsAt: new Date(Date.now() + 100000).toISOString(),
    currency: "XOF"
  });
  assert.equal(evt.currency, "XOF");
});
```

> Adapter le payload minimal requis par `createEventSchema` (champs obligatoires réels du schéma).

- [ ] **Step 2: Lancer — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "enregistre la devise"`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

Ajouter un schéma de devise réutilisable près des schémas d'event :

```ts
const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Devise ISO 4217 (3 lettres majuscules)");
```

Dans `createEventSchema`, ajouter `currency: currencySchema.optional(),`.
Dans le `data` de `createEvent`, ajouter :

```ts
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
```

Dans `updateEventSchema`, ajouter `currency: currencySchema.optional(),`.
Dans le mapping de `updateEvent`, ajouter :

```ts
    if (input.currency !== undefined) data.currency = input.currency;
```

- [ ] **Step 4: Lancer — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "enregistre la devise"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/events/events.service.ts apps/api/src/events/events.service.test.ts
git commit -m "feat(api): events accept ISO 4217 currency (default XOF)"
```

---

### Task 4: API — garde-fou « devise encaissable » à l'init paiement

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts` (init public + core), ajout d'une constante d'encaissabilité
- Test: `apps/api/src/payments/payments.service.test.ts` (ou fichier de test paiement existant)

**Interfaces:**
- Consumes: `Event.currency`.
- Produces: toute init de paiement dont l'event a une devise ∉ `ENCASHABLE_CURRENCIES` lève `BadRequestException("currency_not_encashable")`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans le fichier de test paiement :

```ts
test("init public refuse une devise non encaissable", async () => {
  // seed : event ACTIVE avec currency EUR + un vote PENDING lié
  const { eventSlug, tenantSlug, candidatePublicRef } = await seedNonEncashableVote("EUR");
  await assert.rejects(
    () => payments.initPublicPayment({ tenantSlug, eventSlug, candidatePublicRef, amountCfa: 100, voterPhone: "+22990000000" }),
    /currency_not_encashable/
  );
});
```

> Réutiliser les helpers de seed du fichier de test paiement existant ; ajouter la mise à `currency: "EUR"` sur l'event.

- [ ] **Step 2: Lancer — doit échouer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "devise non encaissable"`
Expected: FAIL (aucun garde-fou).

- [ ] **Step 3: Implémenter**

En tête de `payments.service.ts`, ajouter :

```ts
const ENCASHABLE_CURRENCIES = ["XOF"] as const;
```

Dans `initPublicPayment` (et, si pertinent, `initPayment`/`initActivationPayment`), après avoir chargé l'event lié, insérer le garde-fou :

```ts
    if (!ENCASHABLE_CURRENCIES.includes(event.currency as (typeof ENCASHABLE_CURRENCIES)[number])) {
      throw new BadRequestException("currency_not_encashable");
    }
```

> Repérer l'endroit où l'event est déjà chargé dans le flux d'init ; s'il ne l'est pas, ajouter un `select: { currency: true }` minimal. Ne pas modifier le `currency: "XOF" as const` du payload PSP (V1 encaisse XOF).

- [ ] **Step 4: Lancer — doit passer**

Run: `npm --prefix apps/api run test -- --test-name-pattern "devise non encaissable"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.service.test.ts
git commit -m "feat(api): reject payment init for non-encashable event currency (V1: XOF only)"
```

---

### Task 5: Web — centraliser l'affichage via `formatMoney`

**Files:**
- Modify (remplacer les `.toLocaleString(...) + " XOF"/" FCFA"/" CFA"` par `formatMoney`) :
  - `apps/web/app/e/[slug]/c/[ref]/CandidateVoteClient.tsx:71,120`
  - `apps/web/app/e/[slug]/use-public-vote-payment.ts`
  - `apps/web/app/dashboard/search/SearchResultsClient.tsx:131`
  - `apps/web/app/dashboard/admin/subscriptions/page.tsx:117,137`
  - `apps/web/app/dashboard/admin/settings/page.tsx:156,178`
  - `apps/web/app/dashboard/payments/page.tsx`
  - `apps/web/lib/use-activation-payment.ts`
  - `apps/web/components/partner-offer-panel.tsx`
  - `apps/web/app/e/[slug]/results/page.tsx`

**Interfaces:**
- Consumes: `formatMoney` de `@votezpro/shared` (Task 1) ; la devise provient de l'event (`event.currency`) ou par défaut `"XOF"`.

- [ ] **Step 1: Vérifier l'alias d'import du package shared**

Run: `grep -rn "@votezpro/shared" apps/web --include=*.ts --include=*.tsx | head`
Noter l'alias exact utilisé (ex. `@votezpro/shared`). L'utiliser pour importer `formatMoney`.

- [ ] **Step 2: Remplacer, fichier par fichier**

Pour chaque occurrence, remplacer par exemple :

```tsx
// avant
{voteUnitPriceCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF
// après
{formatMoney({ amountMinor: voteUnitPriceCfa, currency: eventCurrency ?? "XOF" }, isEn ? "en-GB" : "fr-FR")}
```

Là où la devise de l'event n'est pas disponible dans le composant, passer `"XOF"` explicitement (comportement identique à l'existant) et laisser un `// TODO(devise): propager event.currency` **uniquement** si la donnée n'existe pas encore dans la page — sinon la câbler.

> Ne pas modifier les `.toLocaleString` qui formatent des **dates** ou des **compteurs de votes** (non monétaires) — seuls les montants sont concernés.

- [ ] **Step 3: Vérifier le build + typecheck**

Run: `npm --prefix apps/web run build`
Expected: build OK, plus aucun `" XOF"`/`" FCFA"`/`" CFA"` concaténé à un montant (vérifier via `grep -rnE "toLocaleString.*(XOF|FCFA|CFA)" apps/web --include=*.tsx`).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "refactor(web): route all money display through formatMoney (currency-aware)"
```

---

## Self-Review

**Spec coverage (Chantier 2) :**
- `Money`/`formatMoney`/`currencyExponent` dans shared → Task 1. ✅
- `Event.currency` (défaut XOF) → Task 2 + Task 3. ✅
- Garde-fou encaissable (V1 XOF only) → Task 4. ✅
- Frontend passe par `formatMoney`, suppression des devises codées en dur → Task 5. ✅
- Hors scope (pas de nouveau PSP / FX / encaissement non-XOF) respecté : aucune tâche ne branche de PSP. ✅

**Placeholder scan :** le seul `TODO` autorisé (Task 5) est conditionnel à une donnée réellement absente de la page ; sinon câbler. Pas d'autre placeholder.

**Type consistency :** `Money.amountMinor`/`currency` identiques entre shared (Task 1) et usages web (Task 5) ; `Event.currency` string cohérent Tasks 2/3/4.

**À vérifier en implémentation :** commande de test réelle du package `shared` ; alias d'import `@votezpro/shared` ; endroit exact où l'event est chargé dans `initPublicPayment` (Task 4).

**Hors périmètre :** annuaire (Chantier 1), billetterie/PWA (Chantier 3).
