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
- **Paiements :** FeexPay, Kkiapay, FedaPay
- **Auth :** JWT (access + refresh tokens), OAuth (Google/Facebook)
- **Observabilité :** Sentry, logs structurés

## Fonctionnalités principales

- Concours et votes payants via mobile money (XOF/FCFA)
- Multitenant : chaque organisateur a son espace isolé
- Offre Escrow (parcours actif) : portefeuille, clôture, retraits validés admin
- Offre External : en réflexion (désactivée pendant la phase de test)
- Paiements démo pour la phase de test (`API_PAYMENT_DEMO_MODE`, interdit en prod)
- Billetterie avec QR codes
- Paiements automatisés aux organisateurs
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
| `npm run test` | Tests |
| `npm run db:generate` | Générer le client Prisma |
| `npm run db:seed` | Seed la base de données |
| `npm run db:migrate:deploy` | Appliquer les migrations |
