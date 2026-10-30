# Déploiement staging / production

Ce document décrit ce qui est **réellement** livré dans le dépôt pour déployer SHADOMA,
et les vérifications à faire. Aucun hébergeur n'est imposé : l'API est une image Docker,
le front une app Next.js, le cron un Worker Cloudflare.

## Ce que contient le dépôt

| Composant | Fichier | État |
|---|---|---|
| Intégration continue | `.github/workflows/ci.yml` | typecheck, lint, tests API (`npm test` + `test:offers`), tests web, e2e Playwright |
| Image API | `apps/api/Dockerfile` + `apps/api/docker-entrypoint.sh` | construite et démarrée en `NODE_ENV=production` le 30/10/2026 |
| Worker cron | `infra/maintenance-cron-worker` (`wrangler.toml`) | crons : 5 min (balayages) + quotidien (purge) |
| Front | `apps/web` (`next build`) | à déployer sur l'hébergeur Next.js choisi |
| Modèles d'hébergeur | `docs/deployment/templates/*.example` | non testés (Render, Vercel) |

Aucun workflow de déploiement automatique n'est versionné : le déploiement se fait depuis
l'hébergeur (build de l'image, ou intégration Git) une fois la CI verte.

## API (image Docker)

```bash
docker build -f apps/api/Dockerfile -t shadoma-api .
docker run -p 3001:3001 --env-file <fichier de secrets> shadoma-api
```

- Au démarrage, le conteneur applique les migrations (`prisma migrate deploy`) puis lance
  l'API. Une migration en échec arrête le conteneur. Si l'hébergeur lance les migrations
  dans une étape séparée (ex. `preDeployCommand`), poser `RUN_MIGRATIONS_ON_START=false`.
- Toutes les variables sont listées dans `.env.example` ; la validation est dans
  `apps/api/src/config/env.ts`. En production, l'API **refuse de démarrer** si :
  un secret garde sa valeur `dev-only-*`, `API_PAYMENT_DEMO_MODE=true`,
  `API_DISABLE_THROTTLE=true`, `MAIL_RESEND_API_KEY` manque, ou ni `API_REDIS_URL` ni
  `API_SINGLE_INSTANCE=true` ne sont définis.
- **Plusieurs instances** : définir `API_REDIS_URL` (limites de débit et plafonds de
  l'assistant partagés). **Une seule instance** : `API_SINGLE_INSTANCE=true`.
- Service **toujours actif** recommandé : le planificateur interne (rapprochement des
  paiements, clôtures, réserves, toutes les 5 min) ne tourne que si une instance est
  démarrée. Le worker cron reste le déclencheur de référence.

## Front (Next.js)

`NEXT_PUBLIC_*` et `CSP_REPORT_URI` sont lues par `next build` : en changer la valeur
impose un nouveau build.

| Variable | Défaut | Effet |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL` | — | URL de l'API (navigateur / proxy serveur) |
| `NEXT_PUBLIC_TICKET_SALES_OPEN` | `true` | `false` ferme le formulaire d'achat de billets (interrupteur d'urgence). Le paiement des billets est réel, comme celui des votes. |
| `NEXT_PUBLIC_DEMO_EVENT_SLUG` | vide | Slug d'un concours de démonstration lié depuis la Home |
| `CSP_REPORT_URI` | vide | Collecteur des violations CSP (voir `security-headers.md`) |

## Worker cron

```bash
cd infra/maintenance-cron-worker
npm install
npx wrangler secret put API_MAINTENANCE_CRON_SECRET --env production   # même valeur que l'API
npx wrangler secret put API_BASE_URL --env production                  # ex. https://api.exemple.com
npx wrangler secret put TENANT_SLUG --env production
npm run deploy:production
```

Les appels sont signés (HMAC sur le chemin + le corps, `runAtIso` obligatoire, fenêtre
`API_MAINTENANCE_CRON_MAX_SKEW_SECONDS`). **Déployer le worker et l'API ensemble** : depuis
le 30/10/2026, une version antérieure du worker est refusée par l'API.

## Base de données

Migrations : automatiques au démarrage du conteneur API, ou manuelles :

```bash
DATABASE_URL="postgresql://…" npm run db:migrate:deploy
```

Migrations récentes à vérifier en production (**faire une sauvegarde avant**) :
- `20261029100000_contract_finance_cleanup` — **destructive** : archive les données des
  fonctionnalités retirées dans `LegacyArchive`, puis supprime leurs tables et colonnes
  (abonnements, forfait d'activation, offre partenaire, EXTERNAL, anciens versements).
- `20261029110000_backfill_counts_ledger_labels` — corrige les quantités de votes, les
  écritures de billets et les libellés du grand livre.
- `20261030160000_payout_cooldown_archived_reserve` — délai de 24 h après changement du
  numéro de retrait ; date de clôture rattrapée pour les concours archivés qui détenaient
  une réserve.

## Après déploiement

- `GET /api/v1/health` → `200` (vivacité, sans base).
- `GET /api/v1/health/ready` → `200` avec `checks.database: "ok"` (`503` si Postgres ne
  répond pas en 2 s).
- `POST /api/v1/payments/organizer/topup` sans jeton → `401`.
- Logs du worker : exécutions toutes les 5 min, réponses `2xx`.
- `POST /api/v1/maintenance/cron/purge` renvoie `alreadyExecuted: true` au second appel du jour.
- **Premier passage en paiement réel** : suivre `docs/runbooks/premier-paiement-reel.md`.
  Ne pas ouvrir au public avant que toutes les cases soient cochées.
