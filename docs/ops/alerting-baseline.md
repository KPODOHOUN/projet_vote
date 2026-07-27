# Alerting baseline ops (P0)

Ce document définit le minimum d'alerting production pour SHADOMA Votes.

## Objectif

- Détecter une panne API/web en moins de 5 minutes.
- Escalader automatiquement vers un canal d'astreinte.
- Fournir un runbook clair pour mitigation rapide.

## Workflow actif

- Healthcheck automatisé: `.github/workflows/ops-healthchecks.yml`
- Fréquence: toutes les 5 minutes
- Cibles:
  - API staging/prod (`/api/v1/health/ready`)
  - Web staging/prod (URL publique)
  - Métriques API staging/prod (`/api/v1/ops/metrics`, token `x-ops-token`)

## Variables GitHub requises

### Repository variables

- `API_HEALTHCHECK_URL_STAGING`
- `WEB_HEALTHCHECK_URL_STAGING`
- `API_HEALTHCHECK_URL_PRODUCTION`
- `WEB_HEALTHCHECK_URL_PRODUCTION`
- `API_OPS_METRICS_URL_STAGING`
- `API_OPS_METRICS_URL_PRODUCTION`
- `API_P95_MAX_MS_STAGING` (ex: `1000`)
- `API_P95_MAX_MS_PRODUCTION` (ex: `800`)
- `API_ERROR_RATE_MAX_STAGING` (ex: `0.02`)
- `API_ERROR_RATE_MAX_PRODUCTION` (ex: `0.01`)
- `SENTRY_PROJECT_URL` (URL projet Sentry pour corrélation des incidents)

### Secrets

- `OPS_ALERT_WEBHOOK_URL` (Slack/Discord/Teams compatible webhook)
- `API_OPS_TOKEN` (env API) / `API_OPS_TOKEN` (secret GitHub pour workflow)

## Seuils P0/P1 recommandés

- **P0**: endpoint prod indisponible (HTTP non-2xx) pendant 2 checks consécutifs.
- **P1**: endpoint staging indisponible pendant 3 checks consécutifs.
- **P1**: latence p95 API > 1s pendant 10 minutes.
- **P1**: taux d'erreur 5xx > 1% pendant 5 minutes.

## Escalade

1. Notification webhook automatique.
2. Corrélation run CI + incident Sentry via `SENTRY_PROJECT_URL`.
3. Owner on-call accuse réception (< 10 minutes).
4. Application du runbook incident:
   - `docs/runbooks/api-outage.md`
   - `docs/runbooks/payment-webhook-outage.md`

## Audit ops mensuel

- Vérifier que les URLs de check pointent vers les bonnes révisions.
- Tester le webhook d'alerte (incident simulation).
- Vérifier que les runbooks restent à jour.
