## ADR-008 : Gestion des erreurs & logging
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : Backend Senior, SRE

### Contexte
Besoin de traces fiables pour paiements, fraude, litiges et support.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| Logs JSON structurés + traceId + Sentry | observabilité claire | coût outillage | 3 | 9.1/10 |
| console.log ad hoc | simple | inexploitable en prod | 1 | 2.8/10 |
| Logs partiellement structurés | intermédiaire | incohérences | 2 | 6.3/10 |

### Décision
**Option retenue : logging structuré JSON + corrélation par requestId**.

### Conséquences positives
- Débogage rapide incidents critiques.

### Conséquences négatives / tech debt
- Discipline d’instrumentation nécessaire.

### Règles qui découlent de cette décision
- Aucun log de donnée sensible brute.
- Erreurs API renvoient un code métier stable.
