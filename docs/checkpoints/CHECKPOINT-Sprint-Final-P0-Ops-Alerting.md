# CHECKPOINT Sprint Final P0 - Ops Alerting

Date: 2026-04-29
Statut: valide

## Livrables

- Workflow GitHub `Ops Healthchecks` ajouté:
  - checks API/web staging et production
  - exécution planifiée toutes les 5 minutes
  - notification webhook en échec
- Baseline alerting ops documentée:
  - `docs/ops/alerting-baseline.md`
- Runbooks incidents complets:
  - `docs/runbooks/api-outage.md` (mis à jour)
  - `docs/runbooks/payment-webhook-outage.md` (nouveau)
- Documentation projet alignée:
  - `README.md`
  - `SECURITY.md`

## Variables et secrets à renseigner

- `API_HEALTHCHECK_URL_STAGING`
- `WEB_HEALTHCHECK_URL_STAGING`
- `API_HEALTHCHECK_URL_PRODUCTION`
- `WEB_HEALTHCHECK_URL_PRODUCTION`
- `OPS_ALERT_WEBHOOK_URL` (secret)

## Validation

- Contrôle syntaxe workflow: ok (YAML valide)
- Couverture P0 ops: uptime + escalade + runbooks: ok

## Prochaine tranche

- Instrumentation p95/error-rate centralisée (Sentry + dashboard + seuils actionnables).
