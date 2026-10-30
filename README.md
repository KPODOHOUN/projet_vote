# Shadowa Votes Platform

Plateforme SaaS de concours et votes payants pour l'Afrique francophone.

## Architecture

```
projet_vote/
├── apps/
│   ├── api/          # Backend NestJS
│   └── web/          # Frontend Next.js
├── packages/
│   ├── db/           # Prisma ORM + migrations
│   └── shared/       # Types et contrats partagés
├── design-system/    # Composants UI + tokens
└── docs/             # Documentation
```

## Stack technique

- **Frontend :** Next.js 15 (App Router), React 19, Tailwind CSS v4
- **Backend :** NestJS 11, Prisma ORM
- **Base de données :** PostgreSQL
- **Paiements :** FeexPay, FedaPay (compte plateforme SHADOMA)
- **Auth :** JWT (access + refresh tokens), OAuth (Google/Facebook)
- **Observabilité :** Sentry, logs structurés

## Fonctionnalités principales

- Concours et votes payants via mobile money (XOF/FCFA)
- Multitenant : chaque organisateur a son espace isolé
- Inscription simple, sans abonnement ni frais d'activation
- Mise en ligne d'un concours par la signature électronique de son contrat (PDF signé téléchargeable à volonté) — voir ADR-022
- Commission plateforme de 12 % par défaut prélevée à chaque paiement ; le reste au portefeuille de l'organisateur (réserve + part retirable)
- Paiements démo pour la phase de test (`API_PAYMENT_DEMO_MODE`, interdit en prod)
- Billetterie avec QR codes (paiement réel non branché : la confirmation d'achat n'existe qu'en `API_PAYMENT_DEMO_MODE`)
- Retraits organisateur **100 % manuels** (validation admin) — l'automatisation via PSP est prévue (F6) mais pas encore livrée, et n'est jamais un prérequis de lancement (voir ADR-020)
- Tableau de bord organisateur et administration plateforme
- Conformité RGPD

## Prérequis

- Node.js >= 20.11.0
- PostgreSQL
- Redis (optionnel, pour rate-limiting)

## Installation

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

## Développement

```bash
npm run dev
```

Guide complet pour le mode local et les paiements simulés :
[`docs/guide-lancement-paiements-demo.md`](docs/guide-lancement-paiements-demo.md).

## Scripts disponibles

| Commande | Description |
|---|---|
| `npm run dev` | Lancer tous les workspaces en mode dev |
| `npm run build` | Builder tous les workspaces |
| `npm run lint` | Linter |
| `npm run test` | Tests API — nécessite une base Postgres réelle (`TEST_DATABASE_URL` ou le défaut local) |
| `npm --prefix apps/api run test:offers` | Tests du module `offers/` (wallet, commission, settlement) — plus rapide, mêmes prérequis DB |
| `npm run db:generate` | Générer le client Prisma |
| `npm run db:seed` | Seed la base de données |
| `npm run db:migrate:deploy` | Appliquer les migrations |

**Piège de typecheck :** `apps/api/tsconfig.json` **exclut** les fichiers `*.test.ts` (`tsc --noEmit` ne les vérifie donc jamais). Les fichiers de test sont couverts séparément par `apps/api/tsconfig.test.json` — lancez `cd apps/api && npx tsc -p tsconfig.test.json --noEmit` avant de committer un nouveau test, sinon des erreurs de type peuvent y rester invisibles indéfiniment.

**Piège d'oubli :** les scripts `test`/`test:offers` ci-dessus sont des listes de fichiers codées en dur dans `apps/api/package.json` — un nouveau fichier `*.test.ts` doit y être ajouté manuellement, sinon il ne tourne jamais (aucune CI ne le détecte aujourd'hui, voir `docs/adr/ADR-007-deployment-cicd.md`).
