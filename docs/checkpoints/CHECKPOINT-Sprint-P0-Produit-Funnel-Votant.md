# CHECKPOINT Sprint P0 Produit - Funnel Votant

Date: 2026-04-29
Statut: valide

## Livrables frontend

- `apps/web/app/vote/page.tsx`:
  - entrée votant par slug tenant
- `apps/web/app/vote/[tenantSlug]/page.tsx`:
  - liste publique des évènements votables
- `apps/web/app/vote/[tenantSlug]/[eventSlug]/page.tsx`:
  - sélection candidat
  - saisie montant/téléphone
  - soumission vote + initialisation paiement
  - confirmation transaction
- `apps/web/app/page.tsx`:
  - lien vers espace votant public

## Livrables backend

- `GET /api/v1/votes/public/:tenantSlug/events`
- `GET /api/v1/votes/public/:tenantSlug/events/:eventSlug`
- `POST /api/v1/payments/public/init`

## Sécurité et robustesse

- Paiement public valide tenant/event/vote avant création transaction.
- Contrôle d'idempotence conservé (request hash + scope dédié `payments:public:init`).
- Endpoint paiement public throttle.

## Validation

- Build monorepo: ok
- Test d'intégration API: ok
