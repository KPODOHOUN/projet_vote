# Déploiement « test restreint » — SHADOMA Votes

Objectif : mettre la plateforme en ligne pour un **public restreint de testeurs**, sans argent réel (**paiements FeexPay en mode SANDBOX**), avec des URLs gratuites.

## Architecture cible (sans Railway)

| Composant | Hébergeur | URL type | Coût test |
| --- | --- | --- | --- |
| Frontend (Next.js) | **Vercel** | `https://shadoma-votes.vercel.app` | Gratuit |
| API (NestJS) | **Render** | `https://shadoma-api.onrender.com` | Gratuit* |
| Base PostgreSQL | **Neon** | connexion interne | Gratuit |

\* Le plan gratuit Render **s’endort après ~15 min** sans trafic : le premier appel peut prendre **30–60 s** (cold start). Acceptable pour un test restreint.

> Vercel ne peut pas héberger l’API NestJS long-running ni Postgres. D’où **Neon** (base) + **Render** (API Docker).

---

## Étape 1 — Base PostgreSQL sur Neon

1. Compte sur [neon.tech](https://neon.tech) → **New Project** (région proche de l’Afrique de l’Ouest si dispo, sinon `eu-west`).
2. Copie la **connection string** (onglet *Connection details* → *Prisma*).
   - Elle ressemble à : `postgresql://user:pass@ep-xxx.eu-west-1.aws.neon.tech/neondb?sslmode=require`
3. Garde-la pour l’étape 2 (`DATABASE_URL`).

Optionnel — appliquer migrations + seed en local avant le 1er deploy Render :

```bash
export DATABASE_URL="postgresql://…?sslmode=require"
npm run db:migrate:deploy
RUN_SEED=true npm run db:seed
```

---

## Étape 2 — API sur Render

### Option A — Blueprint (recommandé)

1. [render.com](https://render.com) → **New → Blueprint** → connecte ce dépôt GitHub.
2. Render lit `render.yaml` (build Docker via `Dockerfile.api`).
3. Complète les variables marquées *sync: false* dans le dashboard :

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | Connection string Neon (étape 1) |
| `FEEXPAY_API_KEY` | Clé SANDBOX `test_…` |
| `FEEXPAY_SHOP_ID` | Shop ID sandbox FeexPay |
| `API_CORS_ORIGINS` | URL Vercel (étape 3, ou `*` temporairement) |
| `APP_PUBLIC_URL` | URL Vercel |

4. **Deploy**. L’URL API sera du type `https://shadoma-api.onrender.com`.

### Option B — Manuel

1. **New → Web Service** → repo GitHub.
2. **Environment** : Docker.
3. **Dockerfile Path** : `Dockerfile.api`.
4. **Docker Command** : `./docker-entrypoint.api.sh`.
5. **Health Check Path** : `/api/v1/health`.
6. **Plan** : Free.
7. Colle toutes les variables ci-dessous.

### Variables d’environnement — API (Render)

```bash
NODE_ENV=production
DATABASE_URL=postgresql://…@…neon.tech/neondb?sslmode=require

# Seed de démo au 1er démarrage (retirer après, voir Étape 5)
RUN_SEED=true

# Secrets — Render peut les générer (render.yaml) ou :
# openssl rand -base64 48 | cut -c1-44
API_JWT_SECRET=<32+ caractères>
API_ORGANIZER_SECRET_KEY=<32+ caractères>
API_VAULT_SECRET_KEY=<32+ caractères, DIFFÉRENT>
API_MAINTENANCE_CRON_SECRET=<32+ caractères>
API_OPS_TOKEN=<32+ caractères>

API_CORS_ORIGINS=https://shadoma-votes.vercel.app
APP_PUBLIC_URL=https://shadoma-votes.vercel.app

DEFAULT_PSP_PROVIDER=FEEXPAY
FEEXPAY_BASE_URL=https://api-v2.feexpay.me
FEEXPAY_API_KEY=test_xxxxxxxxxxxxxxxx
FEEXPAY_SHOP_ID=<shop id sandbox>

PLATFORM_PAYOUT_NETWORK=MTN
PLATFORM_PAYOUT_ACCOUNT=00000000
```

> `FEEXPAY_API_KEY` **doit** commencer par `test_` (sandbox). Sinon l’API refuse de démarrer en production.

---

## Étape 3 — Frontend sur Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importe ce dépôt.
2. Vercel lit `vercel.json` (build Next.js). Rien à changer.
3. **Environment Variables** :

```bash
NEXT_PUBLIC_APP_NAME=SHADOMA Votes
NEXT_PUBLIC_APP_URL=https://shadoma-votes.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://shadoma-api.onrender.com/api/v1
```

4. **Deploy**. Note l’URL finale.
5. Reviens sur Render → mets à jour `API_CORS_ORIGINS` et `APP_PUBLIC_URL` avec l’URL Vercel exacte → **Manual Deploy**.

> `NEXT_PUBLIC_API_BASE_URL` doit se terminer par `/api/v1`.

---

## Étape 4 — Vérification (smoke test)

```bash
# API (peut être lent au 1er appel si Render était endormi)
curl https://shadoma-api.onrender.com/api/v1/health

# Frontend
curl -I https://shadoma-votes.vercel.app
```

Ouvre `https://shadoma-votes.vercel.app/e/miss-campus-2026` : 5 candidates, classement visible.

---

## Étape 5 — Sécuriser après le 1er déploiement

1. Retire `RUN_SEED=true` sur Render et redéploie (évite de ré-exécuter le seed à chaque deploy).
2. Change les mots de passe des comptes de démo si le test dure.

---

## Comptes de démo (seed) — testeurs uniquement

Mot de passe partagé testeurs : `SecurePass123!`

| Rôle | E-mail |
| --- | --- |
| Organisateur | `organisateur@demovote.africa` |
| Équipe (staff) | `equipe@demovote.africa` |

Concours de démo : `/e/miss-campus-2026`.

Les testeurs peuvent aussi **s'inscrire librement** sur `/register` (recommandé).

### Compte admin plateforme (propriétaire — ne pas partager)

Réservé au propriétaire du projet. Créé uniquement si `SEED_PLATFORM_ADMIN_PASSWORD` est défini lors du seed :

```bash
export SEED_PLATFORM_ADMIN_PASSWORD="votre-mot-de-passe-secret-12chars"
npm run db:seed
```

| Champ | Valeur |
| --- | --- |
| E-mail | `admin@shadoma.africa` |
| Code org. (si demandé) | `shadoma-platform` |
| Mot de passe | celui que **vous** avez choisi (jamais `SecurePass123!`) |

Conservez ces identifiants dans `.env.owner.local` (gitignored), pas dans le guide testeurs.

---

## Alternatives si Render ne convient pas

| Besoin | Alternative |
| --- | --- |
| Pas de cold start | **Google Cloud Run** (workflow `deploy-api.yml` déjà dans le repo) + Neon |
| Tout Docker, autre hébergeur | **Fly.io** (`fly launch` + `Dockerfile.api`) + Neon |
| Front + back serverless | Cloudflare Pages (front) + Cloud Run (API) — voir `docs/deployment/staging-production.md` |

---

## Rappels

- **Aucun argent réel** : FeexPay SANDBOX uniquement.
- **Accès restreint** = partage du lien aux testeurs uniquement.
- Logs API : Render → *Logs* ; frontend : Vercel → *Deployments*.
