## ADR-005 : Design API (REST vs GraphQL vs tRPC)
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : Tech Lead, Backend Senior, Frontend Senior

### Contexte
Clients web + intégrations externes + webhooks + back-office.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| REST versionné + OpenAPI | standard, intégrable, lisible | plus d’endpoints | 2 | 9.1/10 |
| GraphQL | flexible requêtes | complexité sécurité/caching | 4 | 7.4/10 |
| tRPC only | très bon DX TS | faible interop externe | 2 | 6.6/10 |

### Décision
**Option retenue : REST versionné (`/api/v1`) + OpenAPI**.

### Conséquences positives
- Compatible partenaires et prestataires.
- Contrats stables pour frontend et services tiers.

### Conséquences négatives / tech debt
- Multiplication des routes à gouverner.

### Règles qui découlent de cette décision
- Toutes réponses suivent un contrat JSON explicite.
- Erreurs normalisées avec code métier + message utilisateur.
