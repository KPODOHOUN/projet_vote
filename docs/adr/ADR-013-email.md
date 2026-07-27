## ADR-013 : Email transactionnel
**Statut** : Accepté  
**Date** : 2026-04-28

### Décision
Resend en premier choix, Brevo en fallback fournisseur.

### Règles
- Templates versionnés en code.
- Retry idempotent et journal de livraison obligatoire.
