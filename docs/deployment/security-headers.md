# En-têtes de sécurité du front (Next.js)

Définis dans `apps/web/next.config.ts` (`headers()`), appliqués à toutes les routes :
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: SAMEORIGIN`
et une CSP en **Report-Only** (`Content-Security-Policy-Report-Only`).

L'API a déjà Helmet.

## Passage de la CSP en mode bloquant

1. Déployer en Report-Only et ouvrir la console du navigateur sur les parcours clés :
   Home, `/e/[slug]`, profil candidat + paiement, dashboard (upload photo Cloudinary), admin.
2. Relever chaque violation. Ajouter l'origine à la directive concernée seulement si elle est légitime.
3. Quand plus aucune violation n'apparaît pendant une période d'observation, renommer l'en-tête
   en `Content-Security-Policy`.
4. Étape suivante : remplacer `'unsafe-inline'` de `script-src` par des nonces (middleware Next).

`frame-ancestors 'self'` et `X-Frame-Options: SAMEORIGIN` laissent l'éditeur d'apparence afficher
la page publique dans une iframe du même site. `camera=()` : aucune fonction caméra aujourd'hui ;
à ouvrir (`camera=(self)`) le jour où le scan de billets par la caméra existe.
