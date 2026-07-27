## ADR-014 : Paiements
**Statut** : Accepté  
**Date** : 2026-04-28

### Décision
FeexPay comme provider principal (Mobile Money), Stripe ajouté ensuite pour extension internationale.

### Règles
- Toute transaction utilise une idempotency key.
- Vérification HMAC obligatoire des callbacks.
- Ledger interne immuable pour reconciliation.
