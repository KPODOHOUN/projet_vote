## ADR-010 : Sécurité (threat model résumé)
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : Security Engineer, Tech Lead

### Contexte
Paiements Mobile Money, multi-tenant, exposition publique élevée.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| OWASP-first + STRIDE + chiffrement + idempotence | niveau renforcé | coût implémentation | 5 | 9.5/10 |
| Sécurité standard minimale | rapide | risque élevé fraude/litige | 2 | 4.2/10 |
| Déléguer sécurité tardive | faux gain court terme | dette critique | 3 | 2.9/10 |

### Décision
**Option retenue : sécurité renforcée dès le sprint 0**.

### Conséquences positives
- Réduction forte du risque fraude et fuite.

### Conséquences négatives / tech debt
- Développement initial plus lent.

### Règles qui découlent de cette décision
- HMAC obligatoire sur webhooks paiement.
- Idempotency key obligatoire sur opérations financières.
- Chiffrement AES-256-GCM des secrets sensibles au repos.
