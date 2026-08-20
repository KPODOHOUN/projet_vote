# Lancer et tester SHADOMA en mode paiement démo

Guide pratique pour lancer l’app en local, se connecter, créer un évènement Escrow,
puis tester votes, portefeuille et retraits **sans argent réel**.

Le mode démo confirme les paiements localement, sans débiter de compte Mobile Money
et sans appeler FeexPay, FedaPay ou KkiaPay. Il est **bloqué** si
`NODE_ENV=production`.

> **Phase de test :** seule l’offre **Escrow** est disponible.
> L’offre External est parkée (`offer1_external_enabled=false`).

---

## Parcours recommandé (ce que vous voulez tester maintenant)

1. Lancer l’API + le frontend
2. Se connecter (compte démo **ou** nouvel inscrit Escrow)
3. Créer un évènement
4. Ajouter des candidats
5. Activer l’évènement
6. Voter en public (paiement démo)
7. Vérifier le portefeuille, clôturer, demander un retrait

Les sections ci-dessous détaillent chaque étape.

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

Créer `.env` à la racine du dépôt :

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

Créer `apps/web/.env.local` :

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

Sans clé Resend, l’OTP n’est **pas** envoyé par e-mail. En développement
(`NODE_ENV=development`), l’API renvoie `otpCode` dans la réponse d’inscription /
renvoi : la page `/check-email` l’affiche automatiquement et préremplit le champ.
Sinon, utilisez un compte seed déjà vérifié (section 5).

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
| Organisateur | `organisateur@demovote.africa` | `SecurePass123!` |
| Staff | `equipe@demovote.africa` | `SecurePass123!` |
| Admin plateforme | `admin@shadoma.africa` | valeur de `SEED_PLATFORM_ADMIN_PASSWORD` |

Concours public déjà prêt : `http://localhost:3000/e/miss-campus-2026`

---

## 4. Lancer l’application

Dans **deux** terminaux, depuis la racine :

```bash
npm run dev --workspace=@votezpro/api
```

```bash
npm run dev --workspace=@votezpro/web
```

Vérifier :

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| API santé | http://localhost:3001/api/v1/health |

Si le frontend ne joint pas l’API, contrôlez `NEXT_PUBLIC_API_BASE_URL` et
que le port API est bien `3001`.

---

## 5. Se connecter

### Option A — Compte démo (le plus rapide)

1. Ouvrir http://localhost:3000/login  
   (ou le bouton Connexion sur l’accueil)
2. E-mail : `organisateur@demovote.africa`
3. Mot de passe : `SecurePass123!`
4. Vous arrivez sur le **tableau de bord** organisateur

Ce compte est déjà e-mail vérifié. Pas d’OTP.

### Option B — Nouvel organisateur Escrow

1. Ouvrir http://localhost:3000/register
2. Remplir organisation, prénom, nom, e-mail, mot de passe (≥ 10 caractères,
   2 types de caractères)
3. L’offre **Escrow** est présélectionnée ; External est grisée (« En réflexion »)
4. Accepter la politique de confidentialité → Créer le compte
5. Sur `/check-email`, saisir le code OTP à 6 chiffres  
   - avec mail (Resend) : regardez votre boîte  
   - sans mail en local (`NODE_ENV=development`) : le code s’affiche sur la page
     (bandeau « Mode local / développement ») et est prérempli — cliquez
     « Confirmer l’e-mail »
6. Après OTP, la session s’ouvre et vous êtes redirigé vers le dashboard

### Option C — Admin

1. http://localhost:3000/login avec `admin@shadoma.africa`
2. Mot de passe = `SEED_PLATFORM_ADMIN_PASSWORD` (ex. `AdminDemo123!`)
3. Accéder à http://localhost:3000/admin

### Si la connexion échoue

| Message | Cause probable | Action |
| --- | --- | --- |
| Identifiants invalides | Mauvais e-mail / mot de passe | Vérifier seed / casse |
| Confirmez votre adresse e-mail | Compte non vérifié | `/check-email` + OTP |
| Compte verrouillé | 5 échecs | Attendre ~15 min |
| Session perdue au refresh | Cookie refresh | Rester sur le même domaine `localhost` |

---

## 6. Créer un évènement

Deux chemins possibles. Les deux fonctionnent en Escrow.

### Chemin rapide (recommandé pour un premier essai)

1. Connecté → aller sur http://localhost:3000/dashboard/start  
   (souvent proposé juste après inscription)
2. Saisir :
   - **Titre** du concours (ex. `Mon concours test`)
   - **Nom du premier candidat**
   - Photo optionnelle (URL)
3. Valider
4. L’API crée le concours + le 1er candidat
5. Si le forfait d’activation vaut **0 FCFA** (défaut local), l’évènement peut
   déjà être **ACTIVE**
6. Sinon, suivez le panneau d’activation (paiement démo) sur la page qui s’affiche

Ensuite :

- Personnaliser : `…/design`
- Ajouter d’autres candidats : `…/candidates`
- Lien public : `/e/{slug}`

### Chemin classique (plus de contrôle)

1. http://localhost:3000/dashboard/events
2. **Créer un évènement** → http://localhost:3000/dashboard/events/new
3. Remplir titre, dates début/fin, mise en page (Grille / Liste / Vedette)
4. Créer → vous arrivez sur la fiche évènement
5. **Candidats** : ajouter au moins 2 candidats (nom + photo URL optionnelle)
6. **Éditer / activer** :
   - ouvrir l’évènement → activation
   - si forfait = 0 : bouton d’activation gratuite
   - si forfait > 0 : paiement démo avec un numéro test, ex. `0166000000`
7. Statut attendu : **ACTIVE**
8. Copier le lien public `/e/{slug}`

### Points d’attention à la création

- Offre External : création **bloquée** pendant la phase de test
- Dates : la fin doit être **après** le début
- Sans candidat, le vote public n’a rien à afficher
- Prix du vote : configurable sur l’évènement (sinon règles plateforme)

---

## 7. Tester un vote (paiement démo)

### Sur le concours seed

1. Ouvrir http://localhost:3000/e/miss-campus-2026
2. Choisir un candidat et un nombre de votes
3. Numéro Mobile Money de test : `0166000000`
4. Confirmer
5. En mode démo, le paiement passe immédiatement à `SUCCEEDED`
6. Le classement se met à jour

### Sur votre nouvel évènement

1. Ouvrir `/e/{votre-slug}` (évènement **ACTIVE**)
2. Même parcours de vote
3. Se reconnecter organisateur → fiche évènement + **Portefeuille**

Le mode démo teste la logique interne (idempotence, comptabilisation, classement,
wallet), **pas** le réseau d’un PSP réel.

---

## 8. Escrow de bout en bout (wallet + retrait)

1. Après un vote réussi sur un évènement Escrow, ouvrir  
   http://localhost:3000/dashboard/wallet
2. Le montant net apparaît en **pending** (en attente de clôture)
3. **Clôturer** l’évènement :
   - manuel : fiche évènement → clôturer  
   - ou cron (section 10)
4. Après clôture : retenue plateforme appliquée, solde en **available**
5. Configurer la destination de paiement (numéro MoMo) si demandé
6. Demander un retrait depuis le portefeuille
7. Admin → http://localhost:3000/admin/offers/withdrawals  
   - **Approuver**  
   - **Marquer payé (démo)**

Aucun débit PSP réel tant que `API_PAYMENT_DEMO_MODE=true`.

---

## 9. Auth à vérifier (en plus de la connexion)

Checklist courte :

| Parcours | URL | Attendu |
| --- | --- | --- |
| Inscription Escrow | `/register` | OTP puis session |
| Connexion | `/login` | Dashboard |
| Mot de passe oublié | `/forgot-password` → `/reset-password` | Nouveau mot de passe |
| Compte | `/dashboard/account` | Changement e-mail → re-vérification OTP |
| Google | bouton Google sur login/register | Uniquement si `GOOGLE_CLIENT_*` est configuré |
| Déconnexion | header dashboard | Retour public, session effacée |

External ne doit **pas** être sélectionnable à l’inscription.

---

## 10. Clôture automatique (cron)

Mettre la date de fin d’un évènement **actif** dans le passé, puis :

```bash
set -a; source .env; set +a
node -e 'const {createHmac}=require("crypto"); const body={limit:100,runAtIso:new Date().toISOString()}; const json=JSON.stringify(body); const signature=createHmac("sha256",process.env.API_MAINTENANCE_CRON_SECRET).update(json).digest("hex"); fetch("http://localhost:3001/api/v1/offers/cron/close-expired",{method:"POST",headers:{"content-type":"application/json","x-maintenance-cron-signature":signature},body:json}).then(async r=>{console.log(r.status,await r.text())})'
```

Réponse attendue : `selected`, `closed`, `skipped`, `failed`, `failures`.  
Relancer ne doit **pas** appliquer deux fois la retenue.

Worker Cloudflare local :

```bash
cd infra/maintenance-cron-worker
npm install
printf 'MAINTENANCE_CRON_SECRET=local-cron-secret-change-me-at-least-32-characters\n' > .dev.vars
npx wrangler dev --test-scheduled
```

Même secret côté API et Worker.

---

## 11. Admin utile en phase de test

| Page | Usage |
| --- | --- |
| `/admin/offers` | Offres, Escrow actif, External en réflexion |
| `/admin/offers/events` | Événements actifs / stats |
| `/admin/offers/withdrawals` | Approuver / marquer payé (démo) |
| `/admin/users` | Comptes, suspension |
| `/admin/maintenance` | Mode maintenance |

---

## 12. Après la phase démo (Escrow réel)

Avant de désactiver le mode démo :

1. configurer les credentials PSP **plateforme** ;
2. `API_PAYMENT_DEMO_MODE=false` ;
3. vote sandbox → wallet pending ;
4. clôture → available ;
5. retrait admin manuel.

Ne réactivez External (`offer1_external_enabled=true`) qu’après décision produit
et split validé (ADR-018).

---

## 13. Déployer le cron

```bash
cd infra/maintenance-cron-worker
npx wrangler secret put MAINTENANCE_CRON_SECRET --env staging
npm run deploy:staging
```

Puis production :

```bash
npx wrangler secret put MAINTENANCE_CRON_SECRET --env production
npm run deploy:production
```

Le Worker appelle périodiquement réconciliation, maintenance et clôture des
évènements expirés (HMAC + horodatage).

---

## Dépannage rapide

| Problème | Piste |
| --- | --- |
| Frontend OK, API KO | API non démarrée / mauvais `PORT` |
| Login OK puis déconnexion | Cookie `vp_refresh` / domaine différent |
| Impossible de créer un event External | Normal : offre parkée |
| Activation refusée | Forfait > 0 non payé → payer en démo |
| Vote sans effet wallet | Évènement pas ACTIVE, ou pas Escrow |
| OTP introuvable | Pas de mail → bandeau sur `/check-email` en `development`, ou logs API |
| Migration manquante | `npm run db:migrate:deploy` puis `db:seed` |
