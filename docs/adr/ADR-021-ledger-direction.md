# ADR-021 — Sens et compartiment des écritures du journal wallet

Statut : accepté (2026-10-25). Complète ADR-020.

## Contexte

`WalletLedgerEntry.amountCfa` est toujours positif. Le sens (crédit ou débit) et le compartiment touché (réserve `heldCfa` ou disponible `withdrawableCfa`) ne sont écrits nulle part : ils se déduisent du `kind`, mais pas toujours.

- `VOTE_CREDIT` part en réserve (modèle legacy, `credit(target: "held")`) ou en disponible (`creditSplit`).
- `ADJUSTMENT` n'est écrit aujourd'hui que par le rejet d'un retrait (crédit du disponible), mais rien n'empêche un débit.

Sans sens explicite, on ne peut pas recalculer les soldes depuis le journal.

## Décision

Deux colonnes nullables, additives :

- `direction LedgerDirection?` (`CREDIT` | `DEBIT`)
- `bucket LedgerBucket?` (`HELD` | `WITHDRAWABLE`)

La décision D6 ne prévoyait que `direction`. `bucket` est ajouté parce qu'une réconciliation par compartiment est impossible sans lui (`VOTE_CREDIT` touche l'un ou l'autre).

Toute nouvelle écriture passe par un seul helper (`appendLedgerEntry`) dont le type TypeScript rend `direction` et `bucket` obligatoires. Un test interdit `walletLedgerEntry.create` ailleurs.

| kind | direction | bucket | Site d'écriture |
|---|---|---|---|
| `HELD_ALLOCATION` | CREDIT | HELD | `creditSplit` (part réserve) |
| `VOTE_CREDIT` | CREDIT | selon l'appel | `creditSplit` → WITHDRAWABLE ; `credit(target: "held")` legacy → HELD |
| `TOPUP_CREDIT` | CREDIT | WITHDRAWABLE | `payment-verify` top-up |
| `RETENTION_DEBIT` | DEBIT | HELD | clôture legacy |
| `WITHDRAWAL_DEBIT` | DEBIT | WITHDRAWABLE | demande de retrait |
| `ADJUSTMENT` | selon l'appel | selon l'appel | rejet de retrait → CREDIT WITHDRAWABLE |
| `HELD_RELEASE` | CREDIT | WITHDRAWABLE | **transfert** réserve → disponible |

`HELD_RELEASE` reste une seule ligne (les calculs de clôture sur ce `kind` ne changent pas). La réconciliation la lit comme un transfert : `CREDIT WITHDRAWABLE` et, en miroir, débit implicite de `HELD`.

Réconciliation par wallet :

- `held = Σ CREDIT HELD − Σ DEBIT HELD − Σ HELD_RELEASE`
- `withdrawable = Σ CREDIT WITHDRAWABLE − Σ DEBIT WITHDRAWABLE`

Une ligne sans `direction` ou sans `bucket` est comptée « inconnue », jamais ajoutée en silence. Un wallet qui a des lignes inconnues est signalé comme non vérifiable.

## Migration et backfill

Migration additive (deux enums, deux colonnes nullables). Backfill déterministe, montants intacts :

- `kind` à sens et compartiment fixes : selon la table.
- `VOTE_CREDIT` : `direction = CREDIT` ; `bucket = WITHDRAWABLE` si une ligne `HELD_ALLOCATION` existe pour le même `paymentId` (preuve d'un `creditSplit`), sinon `NULL`. Un `creditSplit` avec `heldBps = 0` est indiscernable d'un crédit legacy : il reste inconnu.
- `ADJUSTMENT` : `CREDIT WITHDRAWABLE` si `withdrawalId` est renseigné ou si la note commence par « Rejet retrait » ; sinon `NULL`.

## Retour arrière

`DROP COLUMN direction, bucket` puis `DROP TYPE` : aucune autre colonne n'est touchée. Le code antérieur ignore les colonnes et reste compatible avec le schéma migré.
