## ADR-003 : Base de données + stratégie migrations
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : DBA, Tech Lead

### Contexte
Multi-tenant, paiements, audit et analytique, besoin de cohérence transactionnelle.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| PostgreSQL (Neon) + Prisma Migrate | robuste, SQL riche, serverless | tuning index nécessaire | 3 | 9.3/10 |
| MongoDB | flexible | transactions/reporting plus complexes | 3 | 6.9/10 |
| MySQL | solide | moins riche pour certains cas analytiques | 2 | 7.6/10 |

### Décision
**Option retenue : PostgreSQL serverless + Prisma Migrate**.

### Conséquences positives
- SQL adapté aux classements, audits, paiements.
- Migrations versionnées et reproductibles.

### Conséquences négatives / tech debt
- Requiert gouvernance stricte des index.

### Règles qui découlent de cette décision
- Toute table métier inclut tenantId + createdAt.
- Migration obligatoire pour chaque changement de schéma.
