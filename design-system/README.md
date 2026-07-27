# Design System Foundation

Ce dossier contient la base exploitable de la charte graphique:

- `tokens.ts`: source de verite TypeScript
- `theme.css`: variables CSS light/dark
- `gsap-presets.ts`: presets GSAP reutilisables
- `components/`: starter UI kit React TypeScript

## Integration dans `apps/web` (etat reel, branche le 2026-06-17)

Les primitives sont disponibles sans imposer leur charte aux pages bespoke :

1. **Styles** : `components/ui.css` est importe une seule fois dans
   `apps/web/app/layout.tsx`. Ses selecteurs kpi/empty sont scopes sous `.vp-ui`
   pour ne pas collisionner avec le CSS bespoke `.vp-*` de `globals.css`.
2. **Variables** : `apps/web/app/globals.css` definit un *pont* qui mappe les noms
   semantiques attendus par `ui.css` (`--color-action`, `--color-text-primary`,
   `--color-border`, `--radius-md`...) sur la palette de l'app (brand #2E5BFF +
   neutres cream). Les primitives s'accordent donc au look existant.
3. **Imports** : alias TypeScript dans `apps/web/tsconfig.json`
   (`@ds/*` -> `design-system/*`) + barrel `apps/web/components/ui.ts`.

```tsx
import { Button, Input, StatusChip } from "@/components/ui";
```

> Tailwind v4 (`@theme`) est utilise — pas de `tailwind.config.ts`. La SSOT
> couleur/police vit dans `tokens.ts` et est repliquee dans le bloc `@theme` de
> `globals.css`. Pas de `data-theme` : l'app est en thème clair unique.

## Regles de personnalisation evenement

- Le branding evenement peut modifier les variables:
  - `--event-primary`
  - `--event-surface`
  - `--event-accent`
- Les zones critiques ne doivent pas etre override:
  - paiement
  - badges de confiance
  - erreurs de securite
  - administration

## Contraste et accessibilite

- Contraste texte normal >= 4.5:1
- Contraste UI >= 3:1
- Focus ring visible sur tous les elements interactifs
- Respect `prefers-reduced-motion` pour toutes les animations GSAP

## Utilisation GSAP en React

- Installer:
  - `gsap`
  - `@gsap/react`
- Utiliser `useGSAP` avec `scope` pour eviter les fuites.
- Toujours nettoyer les listeners custom en unmount.

## Prochaine etape

Construire et brancher le socle composants:

1. `Button`
2. `Input`
3. `StatusChip`
4. `TrustBadge`
5. `EmptyState`
6. `KpiCard`

Chaque composant doit couvrir les etats loading, success, error, disabled.
