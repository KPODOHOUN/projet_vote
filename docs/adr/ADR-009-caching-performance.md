## ADR-009 : Caching & performance strategy
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : Perf Engineer, Frontend Senior, Backend Senior

### Contexte
Objectifs forts mobile-first et pics de trafic sur concours.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| Cache multi-niveaux (CDN + Redis + query cache) | performant | invalidation complexe | 4 | 9.0/10 |
| CDN seul | simple | insuffisant pour classements temps réel | 2 | 6.7/10 |
| Sans cache | faible complexité | coûts/latence élevés | 1 | 1.9/10 |

### Décision
**Option retenue : CDN + Redis Upstash + stratégies SWR ciblées**.

### Conséquences positives
- Réponse rapide pendant campagnes.

### Conséquences négatives / tech debt
- Plan d’invalidation à maintenir.

### Règles qui découlent de cette décision
- Cache interdit sur endpoints sensibles/perso.
- Mesure continue LCP, INP, TTFB par environnement.
