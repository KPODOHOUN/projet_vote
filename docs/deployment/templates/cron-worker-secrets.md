# Worker cron (Cloudflare) — secrets et variables

Modèle non testé : le dépôt ne déploie pas ce worker. Code : `infra/maintenance-cron-worker/`.
Déploiement : `npx wrangler deploy --env production` depuis ce dossier, après avoir posé les secrets.

| Nom | Type | Rôle |
|---|---|---|
| `API_BASE_URL` | variable | Origine publique de l'API (sans `/api/v1`). |
| `API_MAINTENANCE_CRON_SECRET` | **secret** (`wrangler secret put`) | Même valeur que côté API ; signe chaque appel cron. |
| `RECONCILE_LIMIT`, `RECONCILE_PULL_AFTER_MINUTES`, `RECONCILE_EXPIRE_AFTER_MINUTES` | variables optionnelles | Rapprochement des paiements en attente. |
| `CLOSE_EXPIRED_EVENTS_LIMIT` | variable optionnelle | Clôture des événements échus. |
| `RELEASE_HELD_LIMIT` | variable optionnelle | Libération de la réserve après le délai plateforme. |
| `AUDIT_LOGS_RETENTION_DAYS`, `IDEMPOTENCY_RETENTION_DAYS`, `REVOKED_SESSIONS_RETENTION_DAYS` | variables optionnelles | Purge quotidienne. |
| `TENANT_SLUG` | variable optionnelle | Restreint la purge à un tenant. |

Routes appelées : `payments/cron/reconcile`, `offers/cron/close-expired`, `offers/cron/release-held`, `maintenance/cron/purge`.
Sans ce worker, les paiements en attente ne sont jamais rapprochés et la réserve n'est jamais libérée.
