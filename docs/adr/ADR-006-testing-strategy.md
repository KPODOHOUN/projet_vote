## ADR-006 : Stratégie de tests
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : QA Lead, Tech Lead

### Contexte
Objectif de couverture backend 90% et fiabilité forte des flux paiement/vote.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| Pyramid complète (unit + intégration + e2e) | robuste | coût initial plus élevé | 4 | 9.4/10 |
| Unit tests only | rapide au départ | trous de régression | 2 | 5.9/10 |
| E2E majoritairement | proche réel | lent, fragile | 3 | 7.0/10 |

### Décision
**Option retenue : pyramide complète**, backend >= 90%, e2e critiques obligatoires.

### Conséquences positives
- Réduction majeure des régressions production.

### Conséquences négatives / tech debt
- Pipeline CI plus long.

### Règles qui découlent de cette décision
- Chaque bug corrigé ajoute un test de régression.
- Pas de merge si tests critiques KO.
