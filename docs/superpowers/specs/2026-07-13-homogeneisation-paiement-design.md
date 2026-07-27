# Homogénéisation du système de paiement — Design

**Date** : 2026-07-13
**Branche** : feat/multi-psp-payouts
**Statut** : approuvé (design), en attente de revue du spec écrit

## Contexte

L'architecture multi-PSP (FeexPay, FedaPay, KkiaPay) est en place : port neutre
`PspGateway` + `PspRegistry` qui route par organisateur
(`event.provider → tenant.provider → défaut plateforme`), et pipeline
« verify-by-pull » (ADR-017) comme unique chemin vers `PaymentStatus.SUCCEEDED`.

Mais il subsiste des résidus non homogènes hérités de l'époque « FeexPay
uniquement ». L'objectif est que **le mot « Feexpay » n'apparaisse plus que dans
l'adaptateur FeexPay** (`psp/feexpay.gateway.ts` + `feexpay.http-client.ts`) ;
tout le reste doit être provider-neutre et symétrique entre les 3 PSP.

Aucun changement du comportement de paiement : refactor + comblement de trous de
symétrie, validé par la suite de tests API existante.

## Principe directeur

- Le code générique ne nomme aucun PSP.
- Les 3 PSP sont traités symétriquement là où c'est techniquement possible.
- Le PSP reste invisible pour le votant.

## Découpage

Quatre lots, dans cet ordre. Chacun livrable et testable seul.

| Lot | Axe | Risque | Dépend de |
|-----|-----|--------|-----------|
| A | Nettoyage résidu FeexPay (dead code) | Faible | — |
| B | Renommage neutre | Faible | A |
| C | Symétrie credentials 3 PSP | Moyen | B |
| D | Front de paiement unifié | Faible | — (parallèle) |

---

## Lot A — Nettoyage du résidu FeexPay

### Constat vérifié

`FEEXPAY_CLIENT` / `FeexpayClient` / `FeexpayHttpClient` sont injectés dans
`PaymentsService` (constructeur, `@Inject(FEEXPAY_CLIENT) feexpay`) **et** dans
`FeexpayVerifyService`, mais `this.feexpay` **n'est jamais appelé** dans aucun des
deux : tout passe par `pspRegistry.get(provider).fetchPayinStatus(...)`. C'est du
code mort d'avant le registry.

### Actions

- Retirer l'injection `@Inject(FEEXPAY_CLIENT)` de `PaymentsService` et de
  `FeexpayVerifyService` (+ import `FeexpayClient`).
- Retirer le provider `{ provide: FEEXPAY_CLIENT, useClass: FeexpayHttpClient }`
  du `PaymentsModule` et le retirer des `exports`.
- Supprimer `feexpay/feexpay.http-client.ts` et `feexpay.http-client.test.ts`.
- Supprimer l'interface `FeexpayClient` et le symbole `FEEXPAY_CLIENT` de
  `feexpay.types.ts`.
- Retirer `dist/payments/feexpay/feexpay.http-client.test.js` de la liste de
  tests dans `apps/api/package.json` (scripts `test` et `test:coverage`).
- `feexpay-verify.service.test.ts` : si le test bind un fake sur `FEEXPAY_CLIENT`,
  le rebrancher sur un fake `PspGateway` fourni via un `PspRegistry` de test
  (c'est le vrai chemin de prod). Vérifier ce point avant suppression.

### Hors périmètre

`feexpay.gateway.ts` (adaptateur légitime), comportement HTTP réel.

---

## Lot B — Renommage neutre

### Actions

- `feexpay/feexpay-verify.service.ts` → `payment-verify.service.ts` ; classe
  `FeexpayVerifyService` → `PaymentVerifyService`. Le service remonte de
  `payments/feexpay/` vers `payments/`.
- `FeexpayStatusPayload` → type neutre interne au verify service (déjà quasi
  identique à `PspStatusResult` ; on peut réutiliser `PspStatusResult`).
- Mettre à jour tous les imports : `payments.module.ts`, `payments.service.ts`,
  `backend-completion.test.ts`, `feexpay-verify.service.test.ts` (renommé
  `payment-verify.service.test.ts`).
- AuditLog : `actorUserId: "system:feexpay:verify"` → `"system:payment:verify"`.
  Vérifier qu'aucun test ne matche la chaîne exacte `"system:feexpay:verify"`
  avant de changer (sinon ajuster le test).
- Mettre à jour les chemins de tests dans `apps/api/package.json`.

### Nom retenu

`PaymentVerifyService` (décision utilisateur).

---

## Lot C — Symétrie des credentials 3 PSP

### Constat

- `resolveVotePayinCredentials` ne résout la clé organisateur que pour FeexPay
  (`if (provider === PaymentProvider.FEEXPAY)`). FedaPay et KkiaPay retombent
  toujours sur le compte plateforme.
- `payment-secrets.ts` ne définit qu'une clé : `feexpay_api_secret`.
- **KkiaPay lit ses 3 clés (`public/private/secret`) directement depuis l'env**
  dans le gateway (`this.keys`), et ignore le `PspCredentials` injecté. FedaPay
  utilise `creds.apiKey`.

### Décision

Les 3 PSP acceptent une clé organisateur (KkiaPay inclus, décision utilisateur).

### Actions

1. **Clés secret par provider** — dans `common/payment-secrets.ts` :
   - Conserver `FEEXPAY_API_SECRET_KEY = "feexpay_api_secret"` (rétro-compat).
   - Ajouter `FEDAPAY_API_SECRET_KEY = "fedapay_api_secret"`.
   - Ajouter les clés KkiaPay : `KKIAPAY_PUBLIC_SECRET_KEY = "kkiapay_public_key"`,
     `KKIAPAY_PRIVATE_SECRET_KEY = "kkiapay_private_key"`,
     `KKIAPAY_SECRET_SECRET_KEY = "kkiapay_secret_key"`.
   - Ajouter un helper `paymentSecretKeys(provider)` retournant les clés
     pertinentes par provider.

2. **Étendre `PspCredentials`** (`psp/psp.types.ts`) pour porter les clés
   KkiaPay sans casser FeexPay/FedaPay :
   ```ts
   export interface PspCredentials {
     apiKey: string;
     shop: string;
     // KkiaPay uses a three-key scheme; optional so Feexpay/Fedapay ignore them.
     kkiapayPublicKey?: string;
     kkiapayPrivateKey?: string;
     kkiapaySecretKey?: string;
   }
   ```

3. **`KkiapayGateway` consomme les creds** au lieu de lire l'env directement :
   `requestJson` prend les 3 clés depuis `creds` (fallback env si absentes, pour
   ne pas casser le comportement dev actuel). `this.keys` devient un fallback.

4. **`resolveVotePayinCredentials`** généralisé : pour le provider résolu, tenter
   la clé organisateur/évènement puis le repli plateforme, pour les 3 PSP.
   - FeexPay : `apiKey` orga + `shop` plateforme (inchangé).
   - FedaPay : `apiKey` orga, repli plateforme.
   - KkiaPay : les 3 clés orga si toutes présentes, sinon repli plateforme.

5. **`resolveCredentials` / `resolvePlatformCredentials`** : peupler les champs
   KkiaPay depuis l'env pour le compte plateforme.

6. **`getPaymentSetupStatus`** (organizer-secrets) : rendre le statut par
   provider au lieu d'être câblé sur `FEEXPAY_API_SECRET_KEY`. La forme de
   réponse gagne une dimension provider ; garder la clé `feexpay` pour la
   rétro-compat du front tant qu'il n'est pas adapté.

### Contrainte préservée

KkiaPay reste « payout = UNCERTAIN / résolution manuelle » (le payout unitaire
par organisateur n'existe pas côté KkiaPay). La symétrie porte sur le **payin**
(clé organisateur), pas sur le payout.

### Note migration

Les secrets existants restent sous `feexpay_api_secret`. Aucune migration de
données requise ; les nouvelles clés provider sont additives.

---

## Lot D — Front de paiement unifié

### Constat

Deux hooks parallèles :
- `apps/web/app/e/[slug]/use-public-vote-payment.ts` (vote public, SSE + fallback
  polling).
- `apps/web/lib/use-activation-payment.ts` (activation organisateur, polling
  seul).

Les libellés d'état et les phases divergent.

### Actions (YAGNI)

- Un helper partagé de mapping `status → libellé humanisé` (FR/EN) pour
  `SUCCEEDED` / `FAILED` / `PENDING`, consommé par les deux hooks/vues.
- Aligner les phases exposées (`idle` / `submitting` / `tracking` / `succeeded` /
  `failed`) entre les deux hooks.

### Hors périmètre

Ne **pas** fusionner les deux hooks : leurs transports (SSE vs polling) diffèrent
légitimement. On homogénéise uniquement la couche de présentation du statut. Le
champ `provider` reste non affiché au votant.

---

## Vérification (transverse, à la fin)

- `npm run typecheck` + `npm run lint` sur `apps/api`.
- Suite de tests API complète (`npm test` dans `apps/api`) — inclut déjà
  `psp.registry.test`, verify service, les 3 gateways, payouts, votes.
- Ajustement des chemins de tests renommés/déplacés dans `package.json`.
- Rapport final : ce qui passe, ce qui a changé, ce qui reste (migration prod des
  clés secrets par provider, adaptation front de `getPaymentSetupStatus`).

## Critères de succès

1. `grep -ri feexpay apps/api/src` ne renvoie que l'adaptateur FeexPay et ses
   tests.
2. Un organisateur peut configurer une clé pour n'importe lequel des 3 PSP et le
   payin de vote passe par cette clé.
3. Zéro régression : suite de tests API verte, typecheck + lint OK.
4. Les deux tunnels front affichent des libellés d'état identiques.
