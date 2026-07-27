# FedaPay & KkiaPay — endpoints vérifiés (source de vérité, zéro invention)

> Date : 2026-06-11
> Statut : **Vérifié** depuis les docs officielles + SDK officiel. Tout adapter
> doit s'en tenir STRICTEMENT à ces URLs/champs. Aucun endpoint ne doit être
> inventé. Si un besoin n'est pas couvert ici → `UNCERTAIN`/`ServiceUnavailable`,
> jamais une URL devinée.
>
> Étend `2026-06-04-multi-psp-payout-design.md` : ajoute **FEDAPAY** comme 3e PSP
> et fige le comportement KkiaPay (payin widget + payout non-unitaire).

---

## 1. FedaPay

**Auth :** `Authorization: Bearer <API_SECRET_KEY>` + `Content-Type: application/json`
**Hosts :** sandbox `https://sandbox-api.fedapay.com/v1` · live `https://api.fedapay.com/v1`
**Montants :** entiers (XOF). **Devise :** objet `{"iso":"XOF"}`.

### 1.1 Payin (3 étapes)
Source : https://docs.fedapay.com/integration-api/en/transaction-management-en (+ docs-v1).

1. `POST /transactions`
   body : `{ description, amount, currency:{iso:"XOF"}, callback_url, customer:{ firstname, lastname, email, phone_number:{ number, country } } }`
   → renvoie un objet transaction avec un `id`.
2. `POST /transactions/{id}/token` → renvoie `{ token, url }` (lien + jeton, valide 24 h, usage unique).
3. `POST /{mode}` avec body `{ token }` → déclenche le push mobile money.
   `mode` ∈ `mtn_open` (MTN Bénin), `moov` (Moov Bénin), `sbin` (Celtis Bénin),
   `mtn_ci` (MTN CI), `moov_tg` (Moov Togo), `togocel`, `free_sn`, `airtel_ne`, `mtn_open_gn`.

### 1.2 Statut payin
`GET /transactions/{id}`
Statuts FedaPay → normalisé :
- `pending`, `created` → **PENDING**
- `approved`, `transferred` → **SUCCEEDED**
- `declined`, `canceled`, `expired`, `refunded` → **FAILED**

### 1.3 Payout
Source : https://docs.fedapay.com/integration-api/en/payouts-management-en

1. `POST /payouts`
   body : `{ amount, currency:{iso:"XOF"}, mode?, description?, customer:{ firstname, lastname, email, phone_number:{ number, country } }, merchant_reference, custom_metadata? }`
   → renvoie l'objet payout avec `id` (statut initial `pending`).
2. `PUT /payouts/start`
   body : `{ payouts:[ { id } ] }` (ou `{ id, scheduled_at }`, `{ id, phone_number:{number,country} }`).
3. `GET /payouts/{id}` ou `GET /payouts/merchant/{merchant_reference}`.

Statuts payout FedaPay → normalisé :
- `pending`, `started`, `processing` → **PENDING**
- `sent` → **SUCCEEDED**
- `failed`, `canceled` → **FAILED**

`merchant_reference` = notre clé idempotente (unique côté FedaPay → anti-double-virement).

### 1.4 Balance
Non documenté dans les pages publiques consultées → **non implémenté** (renvoie `{}`).
Ne PAS inventer d'URL. À compléter quand la doc balance sera fournie.

---

## 2. KkiaPay

Source : SDK Node officiel `github.com/kkiapay/nodejs-sdk` (`lib/opts.js`, `lib/transaction/index.js`).
**Hosts :** sandbox `https://api-sandbox.kkiapay.me` · live `https://api.kkiapay.me`
**Headers (les 3 clés) :** `x-api-key: <public>` · `x-private-key: <private>` · `x-secret-key: <secret>`

### 2.1 Payin
**Pas d'endpoint serveur d'init.** Le paiement est initié **côté front** par le widget
JS KkiaPay (clé publique) qui renvoie un `transactionId`. Le serveur ne fait que
**vérifier** (verify-by-pull, conforme ADR-017).
→ `initPayin` de l'adapter = no-op serveur : on s'appuie sur le `transactionId`
fourni par le front, stocké comme `providerRef`.

### 2.2 Statut payin (verify)
`POST /api/v1/transactions/status` body `{ transactionId }`
Statuts KkiaPay → normalisé :
- `SUCCESS` → **SUCCEEDED**
- `PENDING` (si renvoyé) → **PENDING**
- `FAILED`, `INSUFFICIENT_FUND`, `TRANSACTION_NOT_ELIGIBLE`, `TRANSACTION_NOT_FOUND` → **FAILED**

### 2.3 Remboursement (hors scope phase actuelle)
`POST /api/v1/transactions/revert` body `{ transactionId }`. Pas utilisé (no refunds).

### 2.4 Payout — NON unitaire
`POST /merchant/payouts/schedule` est un **balayage automatique** du solde marchand
(algorithme `roof`/`rate`) vers UNE destination préconfigurée — **pas** un virement
unitaire vers le MoMo d'un organisateur arbitraire.
→ **Décision (verrouillée 2026-06-11) :** le payout organisateur via KkiaPay renvoie
**`UNCERTAIN`** (fail-safe) → résolution manuelle admin. Jamais de virement à l'aveugle.
Le payin KkiaPay reste pleinement supporté.

---

## 3. Conséquences d'architecture

| Capacité | FeexPay | FedaPay | KkiaPay |
|---|---|---|---|
| Payin (collecte) | ✅ serveur | ✅ serveur (3 étapes) | ✅ front widget + verify serveur |
| Statut verify-by-pull | ✅ | ✅ | ✅ |
| Payout organisateur unitaire | ✅ | ✅ | ❌ → `UNCERTAIN` (manuel) |
| Balance | ✅ | ⏳ non doc. → `{}` | ⏳ non doc. → `{}` |

Le port `PspGateway` existant (`apps/api/src/payments/psp/psp.types.ts`) couvre déjà
tous ces cas (statut normalisé tri-state + `PspPayoutResult` avec `UNCERTAIN`).
Aucun changement de port nécessaire — uniquement 2 nouveaux adapters + l'enum FEDAPAY.
