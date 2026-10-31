# En-têtes de sécurité du front (Next.js)

Définis dans `apps/web/next.config.ts` (`headers()`), appliqués à toutes les routes :
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: SAMEORIGIN`
et une CSP **appliquée** en production (`Content-Security-Policy`), en **Report-Only** en
développement. `CSP_REPORT_ONLY=true` (figée au build) repasse en observation sans changer le code.

L'API a déjà Helmet.

## Collecte des violations (`CSP_REPORT_URI`)

Variable optionnelle côté front. Si elle contient une URL valide, la CSP reçoit
`report-uri <url>; report-to csp` et la réponse porte `Reporting-Endpoints: csp="<url>"`.
Sans valeur (ou valeur invalide), rien n'est ajouté. **Valeur figée au build** : la changer
impose de reconstruire le front.

Le collecteur reçoit des POST JSON (`application/csp-report` pour `report-uri`,
`application/reports+json` pour `report-to`). Champs à lire : `document-uri` / `url`,
`violated-directive` / `effectiveDirective`, `blocked-uri` / `blockedURL`. Aucun collecteur
n'est fourni par ce dépôt : utiliser celui de l'outil d'observabilité retenu (Sentry accepte
les rapports CSP sur son endpoint `security`).

## Mode bloquant (actif)

Activé le 27/10/2026, avant toute mise en production : le build de production local a été parcouru
(visiteur, organisateur, équipe, admin) sans violation. Si une violation légitime apparaît en
production, reconstruire avec `CSP_REPORT_ONLY=true`, corriger la directive, puis revenir.

### Procédure d'origine (pour mémoire)

1. Déployer en Report-Only et ouvrir la console du navigateur sur les parcours clés :
   Home, `/e/[slug]`, profil candidat + paiement, dashboard (upload photo Cloudinary), admin.
2. Relever chaque violation. Ajouter l'origine à la directive concernée seulement si elle est légitime.
3. Critère de passage : **7 jours consécutifs sans violation légitime** sur les parcours clés
   (les violations dues aux extensions de navigateur, `blocked-uri` en `chrome-extension:` ou
   `moz-extension:`, ne comptent pas). Renommer alors l'en-tête en `Content-Security-Policy`.
4. Étape suivante : remplacer `'unsafe-inline'` de `script-src` par des nonces (middleware Next).

`frame-ancestors 'self'` et `X-Frame-Options: SAMEORIGIN` laissent l'éditeur d'apparence afficher
la page publique dans une iframe du même site. `camera=(self)` : la caméra
n'est permise qu'au site lui-même, pour le scanner des entrées (`/dashboard/events/{id}/tickets/scan`) ;
jamais à un contenu tiers intégré.
