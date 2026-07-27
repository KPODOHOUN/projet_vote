# CHECKPOINT Sprint P0 Produit - Live Payment Confirmation

Date: 2026-04-29
Statut: valide

## Objectif

Enrichir le funnel votant pour afficher une confirmation finale de paiement réel, pilotée par les mises à jour webhook/provider.

## Livrables backend

- Endpoint public ajouté : `POST /api/v1/payments/public/status`
  - validation `tenantSlug` + `eventSlug` + `transactionId` + `voterPhone`
  - vérification de cohérence transaction/vote
  - retour status provider (`PENDING`/`SUCCEEDED`/`FAILED`)

## Livrables frontend

- Page `apps/web/app/vote/[tenantSlug]/[eventSlug]/page.tsx` enrichie:
  - polling toutes les 3 s sur `POST /api/v1/payments/public/status`
  - stop auto au statut final (`SUCCEEDED` ou `FAILED`)
  - feedback UX visible:
    - badge de statut live
    - message de succès final si paiement confirmé
    - message d'erreur si paiement refusé

## UX states couverts

- Loading: chargement évènement
- Error: erreurs API vote/paiement/status
- Success: confirmation explicite après `SUCCEEDED`
- Partial: état intermédiaire `PENDING` avec statut live

## Validation

- Build web/API: ok (compilation Next/Nest)
- Test d'intégration API: ok
