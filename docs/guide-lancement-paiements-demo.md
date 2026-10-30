# Lancer et tester SHADOMA en mode paiement démo

Guide pratique pour lancer l’app en local, se connecter, créer un concours, signer
son contrat, puis tester votes, billets, portefeuille et retraits **sans argent réel**.

Le mode démo confirme les paiements localement, sans débiter de compte Mobile Money
et sans appeler FeexPay ni FedaPay. L’API **refuse de démarrer** si
`API_PAYMENT_DEMO_MODE=true` avec `NODE_ENV=production`.

Modèle en vigueur (ADR-022) : aucun abonnement, aucun forfait d’activation. Un concours
passe en ligne quand son contrat est signé. SHADOMA prélève sa commission (12 % par
défaut) sur chaque paiement ; le reste va au portefeuille de l’organisateur, en partie
en réserve jusqu’à la clôture du concours.

---

## Parcours recommandé

1. Lancer l’API + le frontend
2. Se connecter (compte démo **ou** nouvel inscrit)
3. Créer un concours, fixer le prix du vote, ajouter des candidats
4. Lire et signer le contrat du concours → il passe en ligne
5. Voter en public (paiement démo)
6. Vérifier le portefeuille, clôturer, demander un retrait

---

## 1. Prérequis

- Node.js **20.11** ou plus récent
- npm
- PostgreSQL accessible localement

Créer deux bases :

```bash
createdb votezpro
createdb votezpro_test
```

Si PostgreSQL tourne ailleurs, adaptez les URL ci-dessous.

---

## 2. Configuration locale

Créer `.env` à la racine du dépôt (voir `.env.example` pour la liste complète) :

```dotenv
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://votezpro:votezpro_dev@localhost:5433/votezpro

API_JWT_SECRET=local-jwt-secret-change-me-at-least-32-characters
API_ORGANIZER_SECRET_KEY=local-organizer-secret-change-me-32-characters
API_VAULT_SECRET_KEY=local-vault-secret-change-me-at-least-32-characters
API_MAINTENANCE_CRON_SECRET=local-cron-secret-change-me-at-least-32-characters
API_OPS_TOKEN=local-ops-token-change-me-at-least-32-characters

API_PAYMENT_DEMO_MODE=true
APP_PUBLIC_URL=http://localhost:3000
DEFAULT_PSP_PROVIDER=FEDAPAY

SEED_PLATFORM_ADMIN_PASSWORD=AdminDemo123!
MAIL_RESEND_API_KEY=
```

Les drapeaux booléens n’acceptent que `true`/`false` (ou `1`/`0`) : toute autre valeur
est refusée au démarrage.

Créer `apps/web/.env.local` :

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

Sans clé Resend, aucun e-mail ne part. En développement, l’API renvoie le code OTP
dans la réponse : la page `/check-email` l’affiche et préremplit le champ, et la page
du contrat affiche le code de signature. Sinon, utilisez un compte seed déjà vérifié.

---

## 3. Installer et préparer la base

Depuis la racine :

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Le seed crée notamment :

| Rôle | E-mail | Mot de passe |
| --- | --- | --- |
| Organisateur (titulaire) | `organisateur@demovote.africa` | `SecurePass123!` |
| Équipe | `equipe@demovote.africa` | `SecurePass123!` |
| Admin plateforme | `admin@shadoma.africa` | valeur de `SEED_PLATFORM_ADMIN_PASSWORD` |

Concours public déjà en ligne : `http://localhost:3000/e/miss-campus-2026`

---

## 4. Lancer l’application

Dans **deux** terminaux, depuis la racine :

```bash
npm run dev --workspace=@votezpro/api
```

```bash
npm run dev --workspace=@votezpro/web
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| API santé | http://localhost:3001/api/v1/health |

---

## 5. Se connecter

- **Compte démo** : `organisateur@demovote.africa` / `SecurePass123!` (e-mail déjà vérifié).
- **Nouvel organisateur** : `/register` (prénom, nom, téléphone, e-mail, mot de passe),
  puis code OTP sur `/check-email`.
- **Admin** : `admin@shadoma.africa` + `SEED_PLATFORM_ADMIN_PASSWORD`, puis `/admin`.

| Message | Cause probable | Action |
| --- | --- | --- |
| Identifiants invalides | Mauvais e-mail / mot de passe | Vérifier seed / casse |
| Confirmez votre adresse e-mail | Compte non vérifié | `/check-email` + OTP |
| Compte verrouillé | 5 échecs | Attendre ~15 min |
| Session perdue au refresh | Cookie refresh | Rester sur le même domaine `localhost` |

---

## 6. Créer un concours et le mettre en ligne

1. `/dashboard/start` (chemin rapide : titre + premier candidat) ou
   `/dashboard/events/new` (dates, mise en page).
2. **Prix du vote** : obligatoire pour publier (`…/edit`).
3. **Candidats** : au moins un (`…/candidates`).
4. **Billets** (facultatif) : créez les types de billets **avant** de signer (`…/tickets`).
5. **Contrat** : `…/contract`. Renseignez votre identité, relisez le contrat généré,
   cochez l’acceptation, saisissez votre nom tel qu’il figure au contrat et le code reçu
   par e-mail (affiché sur la page en local). La signature publie le concours (**ACTIVE**).

Seul le titulaire du compte (pas un membre d’équipe) peut signer.

Après signature, le **nom, les dates, le prix du vote et les billets** (nom, prix,
quantité) sont fixés par le contrat : aucun nouveau type de billet ne peut être ajouté.
L’apparence (logo, couleurs, styles) reste modifiable. Modifier le concours entre la
génération et la signature du contrat oblige à en générer un nouveau.

---

## 7. Tester un vote (paiement démo)

1. Ouvrir `/e/{slug}` (concours **ACTIVE**, dans sa période de vote).
2. Choisir un candidat, un nombre de votes, le réseau et un numéro test (ex. `0166000000`).
3. En mode démo, le paiement passe immédiatement à `SUCCEEDED` et le classement se met à jour.

Pour ajouter des votes en tant qu’organisateur : bouton **« Ajouter des votes »** sur la
page du concours. C’est un paiement comme un autre (commission et réserve comprises).

Le mode démo teste la logique interne (idempotence, comptabilisation, portefeuille),
**pas** le réseau d’un PSP réel.

---

## 8. Portefeuille et retrait

1. Après un vote réussi : `/dashboard/wallet`. Le net (brut − 12 %) est partagé entre
   **réserve** et **disponible**.
2. **Clôturer** le concours (fiche concours, ou automatiquement à la date de fin).
   La réserve se libère **48 h après la clôture** (délai réglable par l’admin).
3. Enregistrer le **numéro de retrait** (`/dashboard/account#payout-destination`).
   Par sécurité, un changement de numéro bloque les retraits **24 h** et déclenche un
   e-mail au titulaire.
4. Demander un retrait depuis le portefeuille.
5. Admin → `/admin/offers/withdrawals` : **Approuver**, afficher le numéro, payer,
   puis **Marquer payé**.

Pour supprimer un concours en ligne, clôturez-le d’abord. Un concours qui a encaissé un
paiement ou dont le contrat est signé est archivé, jamais effacé.

---

## 9. Auth à vérifier

| Parcours | URL | Attendu |
| --- | --- | --- |
| Inscription | `/register` | OTP puis session |
| Connexion | `/login` | Dashboard |
| Mot de passe oublié | `/forgot-password` → `/reset-password` | Nouveau mot de passe |
| Compte | `/dashboard/account` | Changement e-mail → re-vérification OTP |
| Google | bouton Google | Uniquement si `GOOGLE_CLIENT_*` est configuré |
| Déconnexion | header dashboard | Retour public, session effacée |

Un code OTP accepte au plus 5 essais, même envoyés en parallèle.

---

## 10. Tâches planifiées (cron)

L’API lance elle-même, toutes les 5 minutes, le rapprochement des paiements, la clôture
des concours échus et la libération des réserves (`API_INTERNAL_SCHEDULER=true`, par
défaut). Le worker Cloudflare (`infra/maintenance-cron-worker`) fait les mêmes appels de
l’extérieur, plus la purge quotidienne ; les deux peuvent tourner ensemble sans rien doubler.

Appel manuel d’un endpoint cron (ex. clôture des concours échus) :

```bash
set -a; source .env; set +a
node -e '
const { createHmac } = require("crypto");
const path = "/api/v1/offers/cron/close-expired";
const body = { limit: 100, runAtIso: new Date().toISOString() };
const sorted = JSON.stringify(Object.fromEntries(Object.entries(body).sort()));
const signature = createHmac("sha256", process.env.API_MAINTENANCE_CRON_SECRET).update(path + "\n" + sorted).digest("hex");
fetch("http://localhost:3001" + path, { method: "POST", headers: { "content-type": "application/json", "x-maintenance-cron-signature": signature }, body: JSON.stringify(body) })
  .then(async (r) => console.log(r.status, await r.text()));'
```

La signature couvre le **chemin** et le corps (clés triées) ; `runAtIso` est obligatoire
et doit dater de moins de `API_MAINTENANCE_CRON_MAX_SKEW_SECONDS` (900 s par défaut).

Worker en local :

```bash
cd infra/maintenance-cron-worker
npm install
printf 'API_MAINTENANCE_CRON_SECRET=local-cron-secret-change-me-at-least-32-characters\nAPI_BASE_URL=http://localhost:3001\nTENANT_SLUG=demo-vote\n' > .dev.vars
npx wrangler dev --test-scheduled
```

---

## 11. Admin utile en phase de test

| Page | Usage |
| --- | --- |
| `/admin/offers` | Taux par défaut, réserve, délais, cohérence du grand livre |
| `/admin/offers/events` | Concours en ligne, stats, contrats signés |
| `/admin/offers/withdrawals` | Approuver / payer les retraits |
| `/admin/users` | Comptes, suspension ; fiche d’un compte : taux négocié de l’organisateur |
| `/admin/maintenance` | Mode maintenance |

---

## 12. Passer au paiement réel

Suivre `docs/runbooks/premier-paiement-reel.md` (sandbox puis live 100 FCFA).

---

## Dépannage rapide

| Problème | Piste |
| --- | --- |
| Frontend OK, API KO | API non démarrée / mauvais `PORT` |
| L’API refuse de démarrer | Lire le message : variable manquante ou interdite (voir `.env.example`) |
| Login OK puis déconnexion | Cookie `vp_refresh` / domaine différent |
| Contrat impossible à générer | Prix du vote, candidat ou date de fin future manquants ; ou compte d’équipe |
| « Le concours ou les conditions ont changé » | Générer un nouveau contrat et le relire |
| Retrait refusé « moins de 24 h » | Numéro de retrait modifié récemment : attendre la fin du délai |
| OTP introuvable | Pas de mail → bandeau sur `/check-email` en `development`, ou logs API |
| Migration manquante | `npm run db:migrate:deploy` puis `db:seed` |
