# CHECKPOINT Sprint P0 Produit - Paiement Realtime SSE

Date: 2026-04-29
Statut: valide

## Objectif

Passer le suivi de confirmation du paiement public en vrai temps réel poussé (SSE) au lieu d'un simple polling client.

## Backend

- Endpoint SSE ajouté:
  - `GET /api/v1/payments/public/status/stream`
- Paramètres de contexte:
  - `tenantSlug`
  - `eventSlug`
  - `transactionId`
  - `voterPhone`
- Emission d'un snapshot toutes les 3 secondes.
- Fermeture automatique du flux au statut final:
  - `SUCCEEDED`
  - `FAILED`

## Frontend

- Page votant `apps/web/app/vote/[tenantSlug]/[eventSlug]/page.tsx`:
  - suppression du polling manuel
  - branchement `EventSource` sur le stream SSE
  - mise à jour UI live du statut transaction
  - fermeture du flux quand statut final atteint
  - fallback automatique vers polling si SSE indisponible/interrompu

## Validation

- Build API: ok
- Build Web: ok
- Bundle votant reste sous la cible initiale du projet
