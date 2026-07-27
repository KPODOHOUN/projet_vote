# Runbook: Payment Webhook Outage

## Sévérité
P0 si les confirmations de paiement ne sont plus appliquées.

## Impact
- Votes bloqués ou non confirmés après paiement.
- Risque de désynchronisation entre le fournisseur et la base VotezPro.

## Detection
- Spike de statuts `pending` dans les transactions.
- Échecs répétés sur `POST /api/v1/payments/webhooks/feexpay`.
- Alerte du provider FeexPay (webhook retries).

## Diagnostic (moins de 5 min)
1. Vérifier la disponibilité de l'endpoint webhook:
   - `curl -i "$API_BASE_URL_PRODUCTION/api/v1/health/ready"`
2. Vérifier la validité du secret:
   - `FEEXPAY_WEBHOOK_SECRET` actif en runtime.
3. Inspecter les logs API filtrés:
   - `path="/api/v1/payments/webhooks/feexpay"`
   - `statusCode>=400`
4. Identifier le type d'erreur:
   - signature invalide
   - payload invalide
   - idempotence rejetée
   - timeout infrastructure

## Mitigation (moins de 15 min)
1. Si secret mismatch:
   - régénérer le secret webhook
   - synchroniser immédiatement FeexPay + backend
2. Si saturation API:
   - scaler Cloud Run (min/max instances)
   - vérifier quotas et latence DB/Redis
3. Si bug de validation:
   - rollback de la révision API précédente stable
4. Lancer un replay manuel des webhooks en échec depuis le fournisseur.

## Resolution permanente
- Ajouter un test de régression d'intégration sur cas réel en échec.
- Vérifier l'idempotence (`idempotencyKey`, `requestHash`) sur le flux impacté.
- Mettre à jour la documentation d'exploitation en cas de nouvelle cause.

## Post-mortem
- Timeline complète (de la détection à la mitigation).
- Root cause technique + cause organisationnelle.
- Mesures préventives (monitoring, tests, seuils).
- Owner et date d'échéance des actions.
