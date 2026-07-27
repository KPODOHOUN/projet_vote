## ADR-015 : Purge maintenance serverless planifiée (HMAC + idempotence)
**Statut** : Accepté  
**Date** : 2026-04-29

### Contexte
La purge des données obsolètes (audit logs, idempotency keys, sessions révoquées) doit pouvoir s'exécuter via un déclencheur serverless planifié (cron), sans ouvrir d'accès admin “humain” et sans risque de doublon en cas de retry.

### Décision
Créer un endpoint dédié au cron :
- `POST /api/v1/maintenance/cron/purge`
- Sécurisé par HMAC-SHA256 via `API_MAINTENANCE_CRON_SECRET`
- Idempotent via une `idempotencyKey` en base (`IdempotencyKey`), scope `maintenance:cron:purge`
- Résolution du tenant via `tenantId` (id) ou `tenantSlug` (slug)

L’endpoint appelle ensuite le service existant `MaintenanceService.purge` pour appliquer la purge et enregistrer un audit log.

### Justification
- Isolation : un secret dédié au cron évite d'exposer les endpoints admin.
- Résilience : l’idempotence empêche des purges répétées lors de retries.
- Sécurité : signature HMAC (contrairement à un simple token bearer) protège contre replays basiques et manipulations.

### Conséquences positives
- Purge automatique “jobless” possible (Cloudflare Cron → endpoint).
- Audit log conservé après chaque exécution planifiée.
- Réduction du risque de purge double / incohérente.

### Conséquences négatives / tech debt
- Le calcul de signature dépend de la représentation stable du body (stableStringify). Si un provider externe envoie un format inattendu, la signature échouera (retour 400).

### Règles qui découlent de cette décision
- Toute exécution planifiée doit être signée via `x-maintenance-cron-signature`.
- Tout retry cron doit réutiliser le même body (ou un body menant à la même idempotency key) pour obtenir le comportement idempotent attendu.
- Ne pas réutiliser l’endpoint admin pour le scheduler.

