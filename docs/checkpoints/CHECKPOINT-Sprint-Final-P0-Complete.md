# CHECKPOINT Sprint Final P0 - Complete

Date: 2026-04-29
Statut: terminé

## P0 valide

- Sécurité API critique appliquée (RBAC, idempotence stricte, secrets prod enforce, throttling sensible).
- Infra déploiement serverless staging/prod en place (API, web, maintenance cron).
- Alerting ops active :
  - uptime API/web (staging + production)
  - contrôle p95 + error-rate via endpoint ops sécurisé
  - escalade webhook
- Runbooks incidents disponibles:
  - `docs/runbooks/api-outage.md`
  - `docs/runbooks/payment-webhook-outage.md`

## Endpoints ops

- `GET /api/v1/ops/metrics` (header `x-ops-token`)
  - fenêtre glissante 5 min
  - `p95DurationMs`
  - `errorRate`

## Variables/secrets ops requis

- `API_OPS_TOKEN` (API runtime)
- `API_OPS_TOKEN` (secret GitHub Action)
- `API_OPS_METRICS_URL_STAGING`
- `API_OPS_METRICS_URL_PRODUCTION`
- `API_P95_MAX_MS_STAGING`
- `API_P95_MAX_MS_PRODUCTION`
- `API_ERROR_RATE_MAX_STAGING`
- `API_ERROR_RATE_MAX_PRODUCTION`
- `OPS_ALERT_WEBHOOK_URL`

## Validation

- Build monorepo: ok
- Test d'intégration API: ok
