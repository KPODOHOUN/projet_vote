# Déploiement Vercel — apps/web (Next.js 15)

Le front `apps/web` se déploie sur Vercel. **L'API NestJS (`apps/api`) ne se déploie PAS
sur Vercel** : héberge-la séparément (Railway / Render / Fly) avec une base Postgres,
puis indique son origine au front via `API_BASE_URL`.

> **Le navigateur doit passer par le proxy `/api/v1` du front** (rewrite de
> `apps/web/next.config.ts`). Si le front et l'API sont sur deux domaines
> différents (ex. `*.vercel.app` et `*.onrender.com`), les cookies `SameSite=Lax`
> de l'API (`oauth_state` pour Google, `vp_refresh` pour la session) ne sont
> jamais renvoyés en appel direct : connexion Google impossible (« État de
> sécurité OAuth invalide ») et session perdue au rechargement. Via le proxy,
> tout est same-origin et ces cookies fonctionnent.

## Réglages projet Vercel

- **Root Directory** : `.` (racine du repo — monorepo npm workspaces)
- **Framework Preset** : Next.js
- Le reste est piloté par `vercel.json` à la racine (install/build/output).

> `vercel.json` build uniquement le workspace `@votezpro/web` et sert
> `apps/web/.next`. Le package `@votezpro/shared` est déclaré mais non importé
> par le front : son absence de `dist` (gitignored) ne casse pas le build.

## Variables d'environnement (onglet Settings → Environment Variables)

| Variable | Requis | Exemple | Note |
|---|---|---|---|
| `API_BASE_URL` | **oui** | `https://shadoma-api.onrender.com` | Origine de l'API (sans `/api/v1`). Cible du proxy `/api/v1` et des appels SSR. |
| `NEXT_PUBLIC_API_BASE_URL` | **non — laisser vide** | *(vide)* ou `/api/v1` | Une URL absolue ici fait appeler l'API en direct par le navigateur et casse Google + la session si les domaines diffèrent (voir plus haut). |
| `NEXT_PUBLIC_SITE_URL` | recommandé | `https://votes.shadoma.xyz` | Base des liens OG / sitemap / partage. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | si upload photos | `shadoma` | Active l'upload de photos candidats (signé). |
| `NEXT_PUBLIC_APP_NAME` | non | `SHADOMA Votes` | Nom affiché. |
| `NEXT_PUBLIC_SENTRY_DSN` | non | `https://...@sentry.io/...` | Monitoring erreurs (build OK sans). |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | non | `0.1` | |

Toutes ces variables commencent par `NEXT_PUBLIC_` → elles sont **exposées au navigateur**.
N'y mets aucun secret. Les secrets (clés PSP, DATABASE_URL, JWT) vivent côté API, pas ici.

## Vérifié en local

`NEXT_PUBLIC_API_BASE_URL=… npm run build --workspace=@votezpro/web` compile
sans erreur (38 routes générées).
