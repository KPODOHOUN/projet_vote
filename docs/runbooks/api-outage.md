# Runbook: API Outage

## Sévérité
P0 si auth, vote ou paiement indisponible.

## Detection
- Échec du workflow `Ops Healthchecks`.
- Alerte uptime HTTP sur `/api/v1/health` ou `/api/v1/health/ready`.
- Spike d'erreurs 5xx dans les logs applicatifs.

## Diagnostic (moins de 5 min)
1. Vérifier la santé API:
   - `curl -i "$API_HEALTHCHECK_URL_PRODUCTION"`
   - `curl -i "$API_BASE_URL_PRODUCTION/api/v1/health/ready"`
2. Vérifier les logs récents et filtrer par `traceId`.
3. Vérifier la connectivité DB (Neon) et la latence.

## Mitigation (moins de 15 min)
1. Redémarrer l'instance API en cas de deadlock process.
2. Basculer le trafic vers la révision précédente stable (Cloud Run).
3. Isoler endpoint fautif via feature flag/routage si possible.
4. Si panne externe (DB/Redis/provider paiement), activer le mode dégradé:
   - bloquer les créations non critiques
   - maintenir lecture publique des concours

## Resolution permanente
- Corriger la root cause (code, config, secret, quota externe).
- Ajouter un test de régression dans `apps/api/src/app.integration.test.ts`.
- Mettre à jour ce runbook en cas de nouveau scénario.

## Post-mortem
- Timeline minute par minute.
- Root cause technique.
- Mesures préventives.
- Owner et date de suivi.
- Lien vers run GitHub et traceIds majeurs.
