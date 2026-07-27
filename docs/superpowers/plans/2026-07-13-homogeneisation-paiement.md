# Homogénéisation du système de paiement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le système de paiement provider-neutre et symétrique entre les 3 PSP (FeexPay, FedaPay, KkiaPay), en supprimant le résidu « FeexPay uniquement », sans changer le comportement de paiement.

**Architecture:** Un port neutre `PspGateway` + `PspRegistry` route déjà chaque transaction par organisateur ; le pipeline verify-by-pull (ADR-017) est l'unique chemin vers `SUCCEEDED`. Ce plan retire le code mort (client FeexPay injecté mais jamais appelé), renomme le service de vérification en neutre, généralise la résolution de clés organisateur aux 3 PSP, et unifie l'affichage d'état côté front.

**Tech Stack:** NestJS 11, Prisma, Zod, `node --test` (tests sur vraie base `votezpro_test`), Next.js (App Router) côté web.

## Global Constraints

- TypeScript strict. Aucun `any` implicite, aucun placeholder, aucune fake data.
- Les tests API frappent la vraie base `votezpro_test` (pas de mock Prisma) ; toute nouvelle table doit être dans `test-utils/db.ts` TABLES (aucune nouvelle table ici).
- Le pipeline verify-by-pull reste l'unique chemin vers `PaymentStatus.SUCCEEDED` ; ne pas modifier sa logique métier.
- Le PSP ne doit jamais être affiché au votant.
- KkiaPay reste `payout = UNCERTAIN` (résolution manuelle) ; la symétrie porte uniquement sur le **payin**.
- Commandes exécutées depuis `apps/api` sauf mention contraire. Chemins de fichiers toujours relatifs à la racine du repo.
- Build test : `cd apps/api && npm run build` compile vers `dist/` ; les tests tournent sur le JS compilé (`dist/**/*.test.js`).
- Spec de référence : `docs/superpowers/specs/2026-07-13-homogeneisation-paiement-design.md`.

---

## File Structure

**Lot A — dead code**
- Modify: `apps/api/src/payments/payments.service.ts` (retirer injection `FEEXPAY_CLIENT`)
- Modify: `apps/api/src/payments/feexpay/feexpay-verify.service.ts` (retirer injection `FEEXPAY_CLIENT`)
- Modify: `apps/api/src/payments/payments.module.ts` (retirer provider + export)
- Modify: `apps/api/src/payments/feexpay/feexpay.types.ts` (retirer `FeexpayClient` + `FEEXPAY_CLIENT`)
- Delete: `apps/api/src/payments/feexpay/feexpay.http-client.ts`, `feexpay.http-client.test.ts`
- Modify: `apps/api/src/payments/feexpay/feexpay-verify.service.test.ts` (fake autonome)
- Modify: `apps/api/package.json` (retirer chemin de test http-client)

**Lot B — renommage neutre**
- Rename: `feexpay/feexpay-verify.service.ts` → `payment-verify.service.ts` (+ classe `PaymentVerifyService`)
- Rename: `feexpay/feexpay-verify.service.test.ts` → `payment-verify.service.test.ts`
- Modify: importeurs (`payments.module.ts`, `payments.service.ts`, `backend-completion.test.ts`)
- Modify: `apps/api/package.json` (chemins de test)

**Lot C — symétrie credentials**
- Modify: `apps/api/src/common/payment-secrets.ts` (clés par provider + helper)
- Modify: `apps/api/src/payments/psp/psp.types.ts` (`PspCredentials` étendu)
- Modify: `apps/api/src/payments/psp/kkiapay.gateway.ts` (consomme creds)
- Modify: `apps/api/src/payments/psp/psp.registry.ts` (résolution généralisée)
- Modify: `apps/api/src/organizer-secrets/organizer-secrets.service.ts` (`getPaymentSetupStatus` par provider)
- Test: `apps/api/src/payments/psp/kkiapay.gateway.test.ts`, `psp.registry.test.ts`

**Lot D — front unifié**
- Create: `apps/web/lib/payment-status-labels.ts` (helper libellés)
- Modify: `apps/web/app/e/[slug]/use-public-vote-payment.ts`
- Modify: `apps/web/lib/use-activation-payment.ts`

---

## Lot A — Nettoyage du résidu FeexPay

### Task A1: Retirer le client FeexPay mort des services et du module

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/feexpay/feexpay-verify.service.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/payments/feexpay/feexpay.types.ts`
- Modify: `apps/api/src/payments/feexpay/feexpay-verify.service.test.ts`
- Delete: `apps/api/src/payments/feexpay/feexpay.http-client.ts`
- Delete: `apps/api/src/payments/feexpay/feexpay.http-client.test.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `PspRegistry.get(provider).fetchPayinStatus(reference, creds)` (chemin de prod existant, inchangé).
- Produces: `PaymentsService` et `FeexpayVerifyService` sans dépendance `FEEXPAY_CLIENT`. Le symbole `FEEXPAY_CLIENT` et l'interface `FeexpayClient` n'existent plus.

- [ ] **Step 1: Confirmer que `this.feexpay` est mort**

Run: `cd apps/api && grep -n "this.feexpay" src/payments/payments.service.ts src/payments/feexpay/feexpay-verify.service.ts`
Expected: aucune ligne (le champ est injecté mais jamais lu).

- [ ] **Step 2: Retirer l'injection dans `payments.service.ts`**

Dans le constructeur, supprimer la ligne :
```ts
    @Inject(FEEXPAY_CLIENT) private readonly feexpay: FeexpayClient,
```
Et l'import ligne 21 :
```ts
import { FEEXPAY_CLIENT, type FeexpayClient } from "./feexpay/feexpay.types";
```
Retirer aussi `Inject` de l'import `@nestjs/common` s'il n'est plus utilisé ailleurs dans le fichier (vérifier avec grep `Inject` — s'il reste des usages, garder).

- [ ] **Step 3: Retirer l'injection dans `feexpay-verify.service.ts`**

Supprimer dans le constructeur :
```ts
    @Inject(FEEXPAY_CLIENT) private readonly feexpay: FeexpayClient,
```
Ajuster l'import ligne 14 pour ne garder que le type de statut encore utilisé :
```ts
import type { FeexpayStatusPayload } from "./feexpay.types";
```
Retirer `Inject` de l'import `@nestjs/common` si plus utilisé.

- [ ] **Step 4: Retirer le provider du module**

Dans `payments.module.ts` : supprimer l'import `FeexpayHttpClient`, l'import `FEEXPAY_CLIENT`, l'entrée `{ provide: FEEXPAY_CLIENT, useClass: FeexpayHttpClient }` du tableau `providers`, et `FEEXPAY_CLIENT` du tableau `exports`.

- [ ] **Step 5: Supprimer l'interface et le symbole morts**

Dans `feexpay.types.ts` : supprimer l'interface `FeexpayClient` (lignes 66-73) et `export const FEEXPAY_CLIENT` (ligne 75). Conserver `FeexpayStatusPayload`, `FeexpayProviderStatus`, `FeexpayWebhookPayload`, `FeexpayOperator`, `FeexpayInitRequest`, `FeexpayInitResult`.

- [ ] **Step 6: Supprimer le client HTTP et son test**

```bash
git rm apps/api/src/payments/feexpay/feexpay.http-client.ts apps/api/src/payments/feexpay/feexpay.http-client.test.ts
```

- [ ] **Step 7: Rendre le fake du test verify autonome**

Dans `feexpay-verify.service.test.ts` : la classe `FakeFeexpay` déclare `implements FeexpayClient`. Retirer `implements FeexpayClient` (garder la classe telle quelle, elle est déjà pilotée via `FakeFeexpayGateway`). Retirer `FeexpayClient` et `FEEXPAY_CLIENT` de l'import depuis `./feexpay.types` (garder `FeexpayStatusPayload`, `FeexpayInitRequest`, `FeexpayInitResult`). Au constructeur `new FeexpayVerifyService(prismaService, fake, notifications, pspRegistry)` : retirer l'argument `fake` (le service n'a plus ce paramètre). Le `fake` reste utilisé par `FakeFeexpayGateway`.

- [ ] **Step 8: Retirer le test http-client de package.json**

Dans `apps/api/package.json`, scripts `test` ET `test:coverage` : retirer le token ` dist/payments/feexpay/feexpay.http-client.test.js`.

- [ ] **Step 9: Compiler**

Run: `cd apps/api && npm run build`
Expected: build OK, aucune erreur TS (les références au symbole supprimé feraient échouer la compilation).

- [ ] **Step 10: Rejouer le test verify**

Run: `cd apps/api && export NODE_ENV=test MAIL_RESEND_API_KEY= DATABASE_URL="${TEST_DATABASE_URL:-postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test}" && npm run test:db:prepare && node --test dist/payments/feexpay/feexpay-verify.service.test.js`
Expected: PASS (tous les tests verts).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(payments): retire le client FeexPay mort (FEEXPAY_CLIENT jamais appelé)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Lot B — Renommage neutre

### Task B1: Renommer FeexpayVerifyService → PaymentVerifyService

**Files:**
- Rename: `apps/api/src/payments/feexpay/feexpay-verify.service.ts` → `apps/api/src/payments/payment-verify.service.ts`
- Rename: `apps/api/src/payments/feexpay/feexpay-verify.service.test.ts` → `apps/api/src/payments/payment-verify.service.test.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/backend-completion.test.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: classe `PaymentVerifyService` (mêmes méthodes publiques : `verifyAndApplyByReference`, `verifyAndApplyByReferenceOrThrow`, `applyDemoSuccess`). Importée depuis `../payment-verify.service` (ou `./payment-verify.service`).

- [ ] **Step 1: Déplacer le fichier service**

```bash
git mv apps/api/src/payments/feexpay/feexpay-verify.service.ts apps/api/src/payments/payment-verify.service.ts
```

- [ ] **Step 2: Renommer la classe et neutraliser les libellés internes**

Dans `payment-verify.service.ts` :
- `export class FeexpayVerifyService` → `export class PaymentVerifyService`
- `Logger(FeexpayVerifyService.name)` → `Logger(PaymentVerifyService.name)`
- Ajuster les imports relatifs : le fichier remonte d'un niveau, donc `../../prisma/...` → `../prisma/...`, `../../notifications/...` → `../notifications/...`, `../../partners/...` → `../partners/...`, `./psp/...` → `./psp/...`, et `./feexpay.types` → `./feexpay/feexpay.types`, `./psp/parse-provider-amount` → `./psp/parse-provider-amount`.
- Remplacer les `actorUserId: "system:feexpay:verify"` par `"system:payment:verify"` (3 occurrences : `verifyAndApplyByReference`, `markFailed`, `auditReject`). Laisser `"system:payments:demo"` inchangé.
- Les warnings logger `msg: "feexpay.verify.unknown_reference"` / `"feexpay.pull_failed"` → `"payment.verify.unknown_reference"` / `"payment.pull_failed"`.

- [ ] **Step 3: Vérifier qu'aucun test ne matche les anciennes chaînes**

Run: `cd apps/api && grep -rn "system:feexpay:verify\|feexpay.verify.unknown_reference\|feexpay.pull_failed" src/`
Expected: aucune ligne restante (sinon ajuster le test concerné à la même étape).

- [ ] **Step 4: Déplacer et adapter le test**

```bash
git mv apps/api/src/payments/feexpay/feexpay-verify.service.test.ts apps/api/src/payments/payment-verify.service.test.ts
```
Dans le test : `import { FeexpayVerifyService } from "./feexpay-verify.service"` → `import { PaymentVerifyService } from "./payment-verify.service"` ; `new FeexpayVerifyService(...)` → `new PaymentVerifyService(...)`. Ajuster les imports relatifs qui remontaient de `payments/feexpay/` vers `payments/` (`../psp/...` → `./psp/...`, `../../...` → `../...`, `./feexpay.types` → `./feexpay/feexpay.types`).

- [ ] **Step 5: Mettre à jour les importeurs**

- `payments.module.ts` : `import { FeexpayVerifyService } from "./feexpay/feexpay-verify.service"` → `import { PaymentVerifyService } from "./payment-verify.service"` ; remplacer dans `providers` et `exports`.
- `payments.service.ts` : `import { FeexpayVerifyService } from "./feexpay/feexpay-verify.service"` → `import { PaymentVerifyService } from "./payment-verify.service"` ; le champ `private readonly verifyService: FeexpayVerifyService` → `PaymentVerifyService`.
- `backend-completion.test.ts` : mettre à jour l'import et toute référence au type/nom.

- [ ] **Step 6: Mettre à jour package.json**

Dans scripts `test` ET `test:coverage` : `dist/payments/feexpay/feexpay-verify.service.test.js` → `dist/payments/payment-verify.service.test.js`.

- [ ] **Step 7: Compiler**

Run: `cd apps/api && npm run build`
Expected: build OK.

- [ ] **Step 8: Rejouer les tests touchés**

Run: `cd apps/api && export NODE_ENV=test MAIL_RESEND_API_KEY= DATABASE_URL="${TEST_DATABASE_URL:-postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test}" && npm run test:db:prepare && node --test dist/payments/payment-verify.service.test.js dist/backend-completion.test.js dist/app.integration.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(payments): FeexpayVerifyService -> PaymentVerifyService (neutre)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Lot C — Symétrie des credentials 3 PSP

### Task C1: Clés secret par provider + `PspCredentials` étendu

**Files:**
- Modify: `apps/api/src/common/payment-secrets.ts`
- Modify: `apps/api/src/payments/psp/psp.types.ts`

**Interfaces:**
- Produces:
  - `payment-secrets.ts` : constantes `FEEXPAY_API_SECRET_KEY = "feexpay_api_secret"` (inchangé), `FEDAPAY_API_SECRET_KEY = "fedapay_api_secret"`, `KKIAPAY_PUBLIC_SECRET_KEY = "kkiapay_public_key"`, `KKIAPAY_PRIVATE_SECRET_KEY = "kkiapay_private_key"`, `KKIAPAY_SECRET_SECRET_KEY = "kkiapay_secret_key"`. Fonction `paymentSecretKeys(provider: PaymentProvider): string[]`.
  - `PspCredentials` gagne 3 champs optionnels : `kkiapayPublicKey?`, `kkiapayPrivateKey?`, `kkiapaySecretKey?`.

- [ ] **Step 1: Étendre `payment-secrets.ts`**

Remplacer le contenu du fichier par :
```ts
import { PaymentProvider } from "@prisma/client";

/** Clé du secret chiffré : clé API FeexPay de l'organisateur (ADR-016). */
export const FEEXPAY_API_SECRET_KEY = "feexpay_api_secret";
/** Clé API FedaPay (Bearer secret) de l'organisateur. */
export const FEDAPAY_API_SECRET_KEY = "fedapay_api_secret";
/** Trois clés KkiaPay de l'organisateur (schéma public/private/secret). */
export const KKIAPAY_PUBLIC_SECRET_KEY = "kkiapay_public_key";
export const KKIAPAY_PRIVATE_SECRET_KEY = "kkiapay_private_key";
export const KKIAPAY_SECRET_SECRET_KEY = "kkiapay_secret_key";

/**
 * Clés de secret organisateur pertinentes pour un provider donné. FeexPay et
 * FedaPay n'ont qu'une clé ; KkiaPay en a trois (toutes requises pour router
 * un payin sur le compte de l'organisateur).
 */
export function paymentSecretKeys(provider: PaymentProvider): string[] {
  switch (provider) {
    case PaymentProvider.FEEXPAY:
      return [FEEXPAY_API_SECRET_KEY];
    case PaymentProvider.FEDAPAY:
      return [FEDAPAY_API_SECRET_KEY];
    case PaymentProvider.KKIAPAY:
      return [KKIAPAY_PUBLIC_SECRET_KEY, KKIAPAY_PRIVATE_SECRET_KEY, KKIAPAY_SECRET_SECRET_KEY];
    default:
      return [];
  }
}
```

- [ ] **Step 2: Étendre `PspCredentials`**

Dans `psp.types.ts`, remplacer l'interface :
```ts
/** Credentials resolved per-request from the EventSecret → TenantSecret → env chain. */
export interface PspCredentials {
  apiKey: string;
  shop: string;
  // KkiaPay uses a three-key scheme; optional so Feexpay/Fedapay ignore them.
  kkiapayPublicKey?: string | undefined;
  kkiapayPrivateKey?: string | undefined;
  kkiapaySecretKey?: string | undefined;
}
```

- [ ] **Step 3: Compiler**

Run: `cd apps/api && npm run build`
Expected: build OK (changements purement additifs).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(payments): clés secret par provider + PspCredentials pour KkiaPay

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C2: KkiapayGateway consomme les credentials

**Files:**
- Modify: `apps/api/src/payments/psp/kkiapay.gateway.ts`
- Test: `apps/api/src/payments/psp/kkiapay.gateway.test.ts`

**Interfaces:**
- Consumes: `PspCredentials` étendu (Task C1).
- Produces: `KkiapayGateway.requestJson` utilise les clés de `creds` quand présentes, sinon repli env. `fetchPayinStatus(reference, creds)` propage `creds`.

- [ ] **Step 1: Écrire le test — les clés des creds priment sur l'env**

Dans `kkiapay.gateway.test.ts`, ajouter un test qui capture les en-têtes envoyés. Mocker `globalThis.fetch` et vérifier que lorsque `creds.kkiapayPublicKey/Private/Secret` sont fournis, ils apparaissent dans les headers `x-api-key`/`x-private-key`/`x-secret-key` (et non les valeurs env). Modèle :
```ts
test("fetchPayinStatus utilise les clés des credentials plutôt que l'env", async () => {
  const captured: Record<string, string> = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    Object.assign(captured, init.headers as Record<string, string>);
    return new Response(JSON.stringify({ status: "SUCCESS", amount: 500, currency: "XOF" }), { status: 200 });
  }) as typeof fetch;
  try {
    const gw = new KkiapayGateway();
    await gw.fetchPayinStatus("tx_1", {
      apiKey: "", shop: "",
      kkiapayPublicKey: "orga_pub", kkiapayPrivateKey: "orga_priv", kkiapaySecretKey: "orga_sec"
    });
    assert.equal(captured["x-api-key"], "orga_pub");
    assert.equal(captured["x-private-key"], "orga_priv");
    assert.equal(captured["x-secret-key"], "orga_sec");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```
Ajouter les imports nécessaires en tête de fichier s'ils manquent (`import { test } from "node:test"; import assert from "node:assert/strict"; import { KkiapayGateway } from "./kkiapay.gateway";`) — vérifier ce qui existe déjà.

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/api && npm run build && node --test dist/payments/psp/kkiapay.gateway.test.js`
Expected: FAIL (le gateway lit encore l'env, `captured["x-api-key"]` = valeur env, pas `"orga_pub"`).

- [ ] **Step 3: Implémenter la consommation des creds**

Dans `kkiapay.gateway.ts` :
- Modifier `requestJson` pour accepter les clés en paramètre : signature `private async requestJson<T>(method: "POST", url: string, keys: { publicKey: string; privateKey: string; secretKey: string }, body: unknown): Promise<T>` et utiliser `keys` pour les headers au lieu de `this.keys`.
- Ajouter un helper `private keysFrom(creds: PspCredentials)` :
```ts
  private keysFrom(creds: PspCredentials): { publicKey: string; privateKey: string; secretKey: string } {
    const env = this.keys;
    return {
      publicKey: creds.kkiapayPublicKey || env.publicKey,
      privateKey: creds.kkiapayPrivateKey || env.privateKey,
      secretKey: creds.kkiapaySecretKey || env.secretKey
    };
  }
```
- Dans `fetchPayinStatus`, remplacer l'appel par : `const raw = await this.requestJson<...>("POST", url, this.keysFrom(_creds), { transactionId: reference });` et renommer `_creds` → `creds`.

- [ ] **Step 4: Vérifier le passage**

Run: `cd apps/api && npm run build && node --test dist/payments/psp/kkiapay.gateway.test.js`
Expected: PASS (tous les tests, y compris les existants).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(payments): KkiapayGateway consomme les credentials (clé orga possible)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C3: Résolution des credentials organisateur généralisée aux 3 PSP

**Files:**
- Modify: `apps/api/src/payments/psp/psp.registry.ts`
- Test: `apps/api/src/payments/psp/psp.registry.test.ts`

**Interfaces:**
- Consumes: `paymentSecretKeys(provider)` (C1), `PspCredentials` étendu (C1), `OrganizerSecretsService.resolvePaymentSecret(eventId, tenantId, key)` (existant).
- Produces: `resolveVotePayinCredentials` résout la clé organisateur pour FEEXPAY, FEDAPAY et KKIAPAY ; `resolveCredentials`/`resolvePlatformCredentials` peuplent les champs KkiaPay depuis l'env.

- [ ] **Step 1: Écrire le test — clé orga FedaPay routée**

Dans `psp.registry.test.ts`, s'appuyer sur le pattern existant (vraie base). Ajouter un test : pour un event non-partenaire dont le provider résolu est FEDAPAY, si une `TenantSecret` `fedapay_api_secret` existe, `resolveVotePayinCredentials` renvoie `apiKey` = cette valeur.
```ts
test("resolveVotePayinCredentials route la clé orga FedaPay", async () => {
  const t = await prisma.tenant.create({ data: { slug: "fdp-org", displayName: "Fdp", provider: "FEDAPAY" } });
  const e = await prisma.event.create({ data: { tenantId: t.id, slug: "fdp-evt", title: "E", startsAt: new Date(), endsAt: new Date() } });
  await secrets.saveSecret({ userId: "u", tenantId: t.id, role: "ORGANIZER" } as any, { key: "fedapay_api_secret", value: "sk_orga_fedapay" });
  const creds = await registry.resolveVotePayinCredentials({ eventId: e.id, tenantId: t.id });
  assert.equal(creds.apiKey, "sk_orga_fedapay");
});
```
Adapter les noms de variables (`prisma`, `secrets`, `registry`) à ceux déjà présents dans le fichier de test ; adapter les champs requis d'`event`/`tenant` au schéma réel (vérifier les autres `create` du fichier).

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/api && npm run build && export NODE_ENV=test MAIL_RESEND_API_KEY= DATABASE_URL="${TEST_DATABASE_URL:-postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test}" && npm run test:db:prepare && node --test dist/payments/psp/psp.registry.test.js`
Expected: FAIL (FedaPay retombe sur la clé plateforme, `creds.apiKey` ≠ `"sk_orga_fedapay"`).

- [ ] **Step 3: Implémenter la résolution généralisée**

Dans `psp.registry.ts`, ajouter `import { paymentSecretKeys } from "../../common/payment-secrets";` et remplacer le corps de `resolveVotePayinCredentials` :
```ts
  async resolveVotePayinCredentials(ctx: {
    eventId: string;
    tenantId: string;
  }): Promise<PspCredentials> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: ctx.eventId },
      select: { isPartnerEvent: true }
    });
    const provider = await this.resolveProvider(ctx);
    if (event?.isPartnerEvent) {
      return this.resolvePlatformCredentials(provider);
    }

    const platformCreds = await this.resolvePlatformCredentials(provider);
    const keys = paymentSecretKeys(provider);
    const resolved = await Promise.all(
      keys.map((k) => this.organizerSecrets.resolvePaymentSecret(ctx.eventId, ctx.tenantId, k))
    );

    if (provider === PaymentProvider.FEEXPAY) {
      const [apiKey] = resolved;
      if (apiKey) return { ...platformCreds, apiKey, shop: platformCreds.shop };
      return platformCreds;
    }
    if (provider === PaymentProvider.FEDAPAY) {
      const [apiKey] = resolved;
      if (apiKey) return { ...platformCreds, apiKey, shop: "" };
      return platformCreds;
    }
    if (provider === PaymentProvider.KKIAPAY) {
      const [pub, priv, sec] = resolved;
      if (pub && priv && sec) {
        return {
          ...platformCreds,
          kkiapayPublicKey: pub,
          kkiapayPrivateKey: priv,
          kkiapaySecretKey: sec
        };
      }
      return platformCreds;
    }
    return platformCreds;
  }
```

- [ ] **Step 4: Peupler les champs KkiaPay pour le compte plateforme**

Dans `resolveCredentials`, la branche KKIAPAY renvoie aujourd'hui `{ apiKey: env.KKIAPAY_SECRET_KEY, shop: "" }`. La remplacer par :
```ts
      case PaymentProvider.KKIAPAY:
        return {
          apiKey: env.KKIAPAY_SECRET_KEY,
          shop: "",
          kkiapayPublicKey: env.KKIAPAY_PUBLIC_KEY,
          kkiapayPrivateKey: env.KKIAPAY_PRIVATE_KEY,
          kkiapaySecretKey: env.KKIAPAY_SECRET_KEY
        };
```

- [ ] **Step 5: Vérifier le passage**

Run: `cd apps/api && npm run build && export NODE_ENV=test MAIL_RESEND_API_KEY= DATABASE_URL="${TEST_DATABASE_URL:-postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test}" && npm run test:db:prepare && node --test dist/payments/psp/psp.registry.test.js`
Expected: PASS (nouveau test + existants).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(payments): clé organisateur résolue pour les 3 PSP (payin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C4: `getPaymentSetupStatus` par provider

**Files:**
- Modify: `apps/api/src/organizer-secrets/organizer-secrets.service.ts`
- Test: `apps/api/src/organizer-secrets/organizer-secrets.service.test.ts`

**Interfaces:**
- Consumes: `paymentSecretKeys(provider)` (C1), `PspRegistry.resolveProvider(ctx)` (existant).
- Produces: `getPaymentSetupStatus(user, eventId?)` reflète le provider résolu. Conserve les champs consommés par le front : `key`, `organizerConfigured`, `eventConfigured`, `platformFallback`, `readyForVotes`, `activationUsesPlatformAccount`, `platformReadyForActivation`, `effectiveSource`. Ajoute `provider: PaymentProvider`.

> **Note de dépendance :** `OrganizerSecretsService` ne connaît pas `PspRegistry` aujourd'hui. Pour éviter une dépendance circulaire de module (payments importe organizer-secrets), on ne l'injecte PAS. On lit directement le provider résolu depuis la DB avec la même chaîne que `resolveProvider` : `event.provider ?? event.tenant.provider ?? tenant.provider ?? env.DEFAULT_PSP_PROVIDER`.

- [ ] **Step 1: Écrire le test — statut reflète le provider KkiaPay**

Dans `organizer-secrets.service.test.ts`, ajouter :
```ts
test("getPaymentSetupStatus reflète le provider résolu (KkiaPay = 3 clés)", async () => {
  const t = await prisma.tenant.create({ data: { slug: "kki-org", displayName: "Kki", provider: "KKIAPAY" } });
  // aucune clé configurée → not ready sur crédentiels orga
  const setup = await secrets.getPaymentSetupStatus(user(t.id));
  assert.equal(setup.provider, "KKIAPAY");
  assert.equal(setup.organizerConfigured, false);
});
```
Adapter `user(...)` / `secrets` / `prisma` aux helpers existants du fichier.

- [ ] **Step 2: Vérifier l'échec**

Run: `cd apps/api && npm run build && export NODE_ENV=test MAIL_RESEND_API_KEY= DATABASE_URL="${TEST_DATABASE_URL:-postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test}" && npm run test:db:prepare && node --test dist/organizer-secrets/organizer-secrets.service.test.js`
Expected: FAIL (pas de champ `provider` dans la réponse).

- [ ] **Step 3: Implémenter**

Ajouter en tête de `organizer-secrets.service.ts` :
```ts
import { PaymentProvider } from "@prisma/client";
import { paymentSecretKeys } from "../common/payment-secrets";
```
Remplacer le corps de `getPaymentSetupStatus` pour résoudre le provider et vérifier ses clés :
```ts
  async getPaymentSetupStatus(user: AuthUser, eventId?: string) {
    // Résolution du provider (même chaîne que PspRegistry.resolveProvider),
    // lue en direct pour ne pas créer de dépendance de module circulaire.
    let provider: PaymentProvider | null = null;
    let event: { id: string } | null = null;
    if (eventId) {
      const ev = await this.prisma.client.event.findFirst({
        where: { id: eventId, tenantId: user.tenantId },
        select: { id: true, provider: true, tenant: { select: { provider: true } } }
      });
      if (ev) {
        event = { id: ev.id };
        provider = ev.provider ?? ev.tenant.provider ?? null;
      }
    }
    if (!provider) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: user.tenantId },
        select: { provider: true }
      });
      provider = tenant?.provider ?? (env.DEFAULT_PSP_PROVIDER as PaymentProvider);
    }

    const keys = paymentSecretKeys(provider);
    const organizerConfigured =
      keys.length > 0 &&
      (await Promise.all(
        keys.map((k) =>
          this.prisma.client.tenantSecret.findUnique({
            where: { tenantId_key: { tenantId: user.tenantId, key: k } }
          })
        )
      )).every(Boolean);

    let eventSecretConfigured = false;
    if (event) {
      const eventSecrets = await Promise.all(
        keys.map((k) =>
          this.prisma.client.eventSecret.findUnique({
            where: { eventId_key: { eventId: event.id, key: k } }
          })
        )
      );
      eventSecretConfigured = keys.length > 0 && eventSecrets.every(Boolean);
    }

    const platformFallback = await this.isPlatformFeexpayConfigured();

    return {
      provider,
      key: keys[0] ?? null,
      organizerConfigured,
      eventConfigured: eventSecretConfigured,
      platformFallback,
      readyForVotes: organizerConfigured || eventSecretConfigured || platformFallback,
      activationUsesPlatformAccount: true,
      platformReadyForActivation: platformFallback,
      effectiveSource: eventSecretConfigured
        ? ("event" as const)
        : organizerConfigured
          ? ("organizer" as const)
          : platformFallback
            ? ("platform" as const)
            : ("none" as const)
    } as const;
  }
```
Vérifier que `isPlatformFeexpayConfigured()` existe déjà dans ce service ; sinon, réutiliser la logique existante (le fichier appelle actuellement `this.isPlatformFeexpayConfigured()` — confirmer le nom exact et l'adapter).

- [ ] **Step 4: Vérifier le passage**

Run: `cd apps/api && npm run build && export NODE_ENV=test MAIL_RESEND_API_KEY= DATABASE_URL="${TEST_DATABASE_URL:-postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test}" && npm run test:db:prepare && node --test dist/organizer-secrets/organizer-secrets.service.test.js`
Expected: PASS.

- [ ] **Step 5: Étendre le type front (non bloquant, additif)**

Dans `apps/web/lib/organizer-secrets.ts`, ajouter `provider?: string;` à l'interface `PaymentSetupStatus` (champ optionnel, ne casse pas le front existant).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(payments): getPaymentSetupStatus reflète le provider résolu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Lot D — Front de paiement unifié

### Task D1: Helper de libellés d'état partagé

**Files:**
- Create: `apps/web/lib/payment-status-labels.ts`
- Modify: `apps/web/app/e/[slug]/use-public-vote-payment.ts`
- Modify: `apps/web/lib/use-activation-payment.ts`

**Interfaces:**
- Produces: `paymentStatusLabel(status: string, isEn: boolean): string`. Mappe `PENDING`/`SUCCEEDED`/`FAILED` (insensible à la casse) vers un libellé FR/EN unique.

- [ ] **Step 1: Créer le helper**

`apps/web/lib/payment-status-labels.ts` :
```ts
/**
 * Libellé humanisé unique pour un statut de paiement, partagé par tous les
 * tunnels (vote public, activation organisateur). Le PSP n'est jamais exposé.
 */
export function paymentStatusLabel(status: string, isEn: boolean): string {
  switch (status.toUpperCase()) {
    case "PENDING":
      return isEn ? "Awaiting mobile-money confirmation…" : "En attente de confirmation mobile money…";
    case "SUCCEEDED":
      return isEn ? "Payment confirmed" : "Paiement confirmé";
    case "FAILED":
      return isEn ? "Payment failed" : "Le paiement a échoué";
    default:
      return isEn ? "Processing…" : "Traitement en cours…";
  }
}
```

- [ ] **Step 2: Consommer dans le tunnel de vote public**

Dans `use-public-vote-payment.ts`, importer `import { paymentStatusLabel } from "@/lib/payment-status-labels";` (adapter l'alias au style du fichier — il utilise déjà `@/lib/api-base-url`). Exposer un libellé dérivé du statut live dans l'objet `status` retourné, p.ex. ajouter au type `PublicVoteStatus` un champ `label: string` et le calculer : `label: livePaymentStatus ? paymentStatusLabel(livePaymentStatus.status, isEn) : ""`. Ne pas modifier la logique SSE/polling.

- [ ] **Step 3: Consommer dans le tunnel d'activation**

Dans `use-activation-payment.ts`, importer le helper et remplacer les libellés d'état ad-hoc par `paymentStatusLabel(liveStatus, isEn)` là où un texte de statut est présenté. Aligner les valeurs de `phase` déjà nommées (`idle`/`submitting`/`tracking`/`succeeded`/`failed`) — elles le sont déjà ; ne pas les renommer.

- [ ] **Step 4: Build web**

Run: `cd apps/web && npm run build`
Expected: build OK (typecheck Next inclus).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): libellés d'état de paiement partagés entre les tunnels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Vérification transverse finale

### Task V1: typecheck, lint, suite complète, rapport

**Files:** aucun (validation).

- [ ] **Step 1: Typecheck + lint API**

Run: `cd apps/api && npm run typecheck && npm run lint`
Expected: 0 erreur.

- [ ] **Step 2: Suite de tests API complète**

Run: `cd apps/api && npm test`
Expected: tous les fichiers verts. Si un chemin de test renommé (`payment-verify.service.test.js`) manque, corriger `package.json`.

- [ ] **Step 3: Résidu FeexPay — critère de succès #1**

Run: `cd apps/api && grep -rin "feexpay" src/ | grep -v "src/payments/feexpay/" | grep -v "feexpay_api_secret"`
Expected: aucune ligne hors de l'adaptateur `src/payments/feexpay/` (les mentions résiduelles légitimes : la clé secret `feexpay_api_secret` et le provider enum `FEEXPAY`). Documenter toute exception restante dans le rapport.

- [ ] **Step 4: Build web complet**

Run: `cd apps/web && npm run build`
Expected: build OK.

- [ ] **Step 5: Rapport final**

Écrire un court récapitulatif : lots livrés, tests passés (compte), résidu FeexPay restant justifié, et ce qui reste pour la prod : (a) provisionner les clés `fedapay_api_secret` / `kkiapay_*` des organisateurs qui le souhaitent ; (b) adapter le front `feexpay-secret-panel.tsx` pour exposer la saisie multi-provider (hors périmètre de ce plan — panel reste FeexPay-only tant que non repris).

---

## Self-Review

**Spec coverage :**
- Lot A (dead code) → Task A1. ✓
- Lot B (renommage `PaymentVerifyService`, type neutre, actorUserId) → Task B1. ✓
- Lot C (clés par provider, `PspCredentials` étendu, KkiaPay consomme creds, résolution généralisée, setup status par provider) → C1/C2/C3/C4. ✓
- Lot D (helper libellés, alignement phases) → D1. ✓
- Vérification transverse → V1. ✓
- Critères de succès #1 (grep résidu) → V1 Step 3 ; #2 (clé orga 3 PSP) → C3 ; #3 (suite verte + typecheck/lint) → V1 ; #4 (libellés identiques) → D1. ✓

**Placeholder scan :** aucun TBD/TODO ; chaque step de code montre le code. Les seules « adaptations à vérifier » (noms de helpers de test existants) sont explicites et bornées.

**Type consistency :** `PaymentVerifyService` (B), `paymentSecretKeys` (C1→C3/C4), `PspCredentials.kkiapay*` (C1→C2/C3), `paymentStatusLabel` (D1). Noms cohérents entre tasks.
