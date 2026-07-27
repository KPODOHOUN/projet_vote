## ADR-004 : Authentification & autorisation (RBAC)
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : Security Engineer, Backend Senior

### Contexte
Rôles distincts: super-admin, admin plateforme, organisateur, staff événement.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| Session + JWT court + refresh rotation + RBAC | sécurisé, scalable | implémentation plus lourde | 4 | 9.0/10 |
| JWT long uniquement | simple | surface de risque élevée | 2 | 5.8/10 |
| Auth full external (vendor lock) | rapide | coût/lock-in | 2 | 7.2/10 |

### Décision
**Option retenue : auth hybride session + JWT court + refresh rotatif + RBAC strict**.

### Conséquences positives
- Réduction risque vol de token.
- Contrôle fin des permissions par action.

### Conséquences négatives / tech debt
- Gestion blacklist/rotation à maintenir.

### Règles qui découlent de cette décision
- Contrôle d’accès sur chaque endpoint sensible.
- MFA obligatoire pour les rôles admin.
