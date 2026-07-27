## ADR-001 : Stack Frontend (framework + state + styling)
**Statut** : Accepté  
**Date** : 2026-04-28  
**Décideurs** : Tech Lead, Lead Designer, Perf Engineer

### Contexte
Plateforme multi-tenant avec pages publiques ultra rapides, back-office riche, i18n FR/EN, animations GSAP/Three.js.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|--------|------|------|-----------|-------|
| Next.js App Router + CSS/Tailwind + Server Components | SSR, perf, SEO, edge-compatible | courbe App Router | 3 | 9.2/10 |
| Nuxt 3 | très bon SSR | équipe orientée TS/Nest | 3 | 8.3/10 |
| SPA React classique | simple | SEO/perf publics plus difficiles | 2 | 6.8/10 |

### Décision
**Option retenue : Next.js 15 App Router** avec design tokens centralisés et GSAP/Three.js ciblés sur pages marketing.

### Conséquences positives
- Bonne base SEO/perf pour pages de vote et acquisition.
- Cohérence forte avec TypeScript strict.

### Conséquences négatives / tech debt
- Discipline requise pour garder bundle public < 200KB.

### Règles qui découlent de cette décision
- Prioriser Server Components sur les pages publiques.
- États loading/error/empty/success obligatoires sur tous les écrans.
