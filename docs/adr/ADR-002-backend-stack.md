## ADR-002 : Stack Backend (runtime + framework + ORM)
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : Tech Lead, Backend Senior, Security Engineer

### Contexte
API métier robuste, webhooks de paiement, contraintes de sécurité renforcées, déploiement serverless.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| NestJS + Node 20 + Prisma | architecture modulaire, DX TS, validation | ORM parfois verbeux | 3 | 9.1/10 |
| Fastify + Zod custom | très rapide | moins structuré pour large équipe | 3 | 8.1/10 |
| Hono/Express minimal | léger | gouvernance plus faible à long terme | 2 | 6.7/10 |

### Décision
**Option retenue : NestJS + Prisma**.

### Conséquences positives
- Structure claire pour domaines critiques (votes, paiements, fraude).
- Intégration simple avec tests et DI.

### Conséquences négatives / tech debt
- Nécessite conventions strictes pour éviter sur-abstraction.

### Règles qui découlent de cette décision
- Architecture contrôleur/service/repository.
- Zod ou class-validator sur toutes les entrées HTTP.
