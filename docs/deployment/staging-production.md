# Déploiement staging/production (P0)

Ce document couvre le déploiement serverless opérationnel de SHADOMA Votes sans VPS.

## Cible runtime

- Frontend: Cloudflare Pages (Next.js)
- API: Google Cloud Run
- Cron de maintenance: Cloudflare Worker Cron Trigger
- Base de données : Neon PostgreSQL

## Pipelines GitHub Actions

- `CI`: `.github/workflows/ci.yml` (typecheck, build, tests API)
- `E2E`: `.github/workflows/e2e.yml` (Playwright, déclenché sur PR + manuel)
- `Deploy API (Cloud Run)`: `.github/workflows/deploy-api.yml`
- `Deploy Maintenance Cron Worker`: `.github/workflows/deploy-maintenance-cron.yml`
- `Deploy Web (Cloudflare Pages Hook)`: `.github/workflows/deploy-web-pages.yml`
- `Ops Healthchecks`: `.github/workflows/ops-healthchecks.yml` (cron */5 min)

## Variables/Secrets GitHub requis

### Repository variables

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`
- `CLOUD_RUN_CPU` (optionnel, défaut `1`)
- `CLOUD_RUN_MEMORY` (optionnel, défaut `512Mi`)
- `CLOUD_RUN_MIN_INSTANCES` (optionnel, défaut `0`)
- `CLOUD_RUN_MAX_INSTANCES` (optionnel, défaut `10`)
- `CLOUDFLARE_ACCOUNT_ID`

### Secrets GitHub

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_PAGES_DEPLOY_HOOK_STAGING`
- `CLOUDFLARE_PAGES_DEPLOY_HOOK_PRODUCTION`

## Déploiement API Cloud Run

1. Ouvrir l'action **Deploy API (Cloud Run)**.
2. Choisir `environment=staging` ou `environment=production`.
3. Laisser `api_image_tag` vide pour utiliser le commit SHA.
4. Le workflow:
   - exécute quality gates (`typecheck`, `test`, `build`)
   - build/push l'image de `apps/api`
   - déploie la révision Cloud Run
   - lance un smoke test sur `/api/v1/health/ready`

## Déploiement Web Cloudflare Pages

1. Configurer les deux deploy hooks Pages dans les secrets GitHub:
   - `CLOUDFLARE_PAGES_DEPLOY_HOOK_STAGING`
   - `CLOUDFLARE_PAGES_DEPLOY_HOOK_PRODUCTION`
2. Lancer l'action **Deploy Web (Cloudflare Pages Hook)**.
3. Choisir l'environnement cible.
4. Vérifier la fin de build dans l'onglet Deployments Cloudflare Pages.

## Déploiement Worker Cron

Le worker est versionné dans `infra/maintenance-cron-worker`.

Avant premier déploiement, configurer les secrets/vars worker par environnement :

```bash
cd infra/maintenance-cron-worker

# Staging
npx wrangler secret put API_MAINTENANCE_CRON_SECRET --env staging
npx wrangler secret put TENANT_SLUG --env staging
npx wrangler secret put API_BASE_URL --env staging

# Production
npx wrangler secret put API_MAINTENANCE_CRON_SECRET --env production
npx wrangler secret put TENANT_SLUG --env production
npx wrangler secret put API_BASE_URL --env production
```

Puis lancer l'action **Deploy Maintenance Cron Worker** avec l'environnement cible.

## Post-déploiement obligatoire

### Migrations base de données

Les migrations s'appliquent **automatiquement** au démarrage du conteneur API (`docker-entrypoint.api.sh`).
Pour une application manuelle (Neon console, bastion) :

```bash
DATABASE_URL="postgresql://…" npm run db:migrate:deploy
```

Migrations récentes à vérifier en prod :
- `20260704170000_candidate_public_ref` — `publicRef` candidat + numéro optionnel
- `20260704120000_partner_program_platform_secrets` — programme partenaires
- `20260702120000_product_events` — événements produit

### Smoke test

```bash
# API (base Cloud Run ou URL healthcheck complète)
bash scripts/smoke-deploy.sh https://api.example.com

# Front public
bash scripts/smoke-deploy.sh --web https://votes.example.com
```

### API

- `GET /api/v1/health` renvoie `200`
- `GET /api/v1/health/ready` renvoie `200`
- endpoints sécurisés critiques :
  - `POST /api/v1/payments/init` exige auth + role
  - `POST /api/v1/payments/webhooks/feexpay` valide strictement `FEEXPAY_WEBHOOK_SECRET`

### Cron

- vérifier dans Cloudflare que le trigger cron est actif
- vérifier la présence des exécutions dans les logs Worker
- vérifier dans l'API que `maintenance/cron/purge` retourne `alreadyExecuted` selon l'idempotence
