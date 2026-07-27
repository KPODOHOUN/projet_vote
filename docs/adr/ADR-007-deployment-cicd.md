## ADR-007 : Déploiement & CI/CD
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : DevOps/SRE, Tech Lead

### Contexte
Contrainte utilisateur : zéro VPS, cible dev/staging/prod.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| Web: Cloudflare Pages + API: Cloud Run + DB: Neon | serverless, scalable, pro | setup multi-provider | 4 | 9.0/10 |
| Full Vercel | simple | refusé par contrainte | 2 | 3.0/10 |
| VPS auto-géré | contrôle total | interdit + ops lourdes | 5 | 2.5/10 |

### Décision
**Option retenue : Cloudflare Pages + Cloud Run + Neon** avec CI GitHub Actions.

### Conséquences positives
- Respect strict du no-VPS.
- Environnements séparés facilement.

### Conséquences négatives / tech debt
- Observabilité distribuée sur plusieurs services.

### Règles qui découlent de cette décision
- Build reproductible sans dépendance locale.
- Variables d’environnement validées au démarrage.
