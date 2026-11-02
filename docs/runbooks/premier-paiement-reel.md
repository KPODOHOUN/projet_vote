# Premier paiement réel — procédure de validation

Dernière réserve avant la mise en production : aucun test automatisé ne remplace une vraie transaction chez un PSP. Cette procédure la lève en deux temps (sandbox, puis live pour 100 FCFA) et dit, à chaque étape, quoi vérifier et où.

Durée : 30 à 45 minutes. Il faut : un accès admin, un accès lecture à la base de production (Neon), un téléphone Mobile Money réel pour l'étape live.

## 0. Préparation

- [ ] Dernier `main` déployé, CI verte, `GET /api/v1/health/ready` → `200` avec `checks.database: "ok"`.
- [ ] `API_PAYMENT_DEMO_MODE=false` (ou variable absente) en production : `true` fait refuser le démarrage.
- [ ] Clés PSP **plateforme** posées ; noter le préfixe : FeexPay `test_` = sandbox, `fp_` = live. FedaPay : `FEDAPAY_BASE_URL` sandbox ou live.
- [ ] Worker cron déployé **avec la même version que l'API** (la signature des appels cron couvre le chemin depuis le 30/10/2026 : un ancien worker est refusé).
- [ ] Un concours de test **en ligne** (contrat signé), avec 2 candidats, prix du vote **100 FCFA**. Noter son slug.
- [ ] Numéro de retrait de l'organisateur de test enregistré **au moins 24 h avant** l'étape de retrait (délai de sécurité après tout changement).

## 1. Sandbox (aucun argent réel)

1. Sur `/e/<slug>`, choisir un candidat, 1 voix, numéro de test du PSP, payer.
2. L'écran de paiement doit passer à « confirmé » sans recharger la page.
3. Vérifier en base (remplacer `<slug>`) :

```sql
-- La transaction : SUCCEEDED, commission posée
SELECT pt.id, pt.provider, pt."providerRef", pt.status, pt."amountCfa", pt."commissionCfa", pt."voteId", pt."createdAt"
FROM "PaymentTransaction" pt JOIN "Event" e ON e.id = pt."eventId"
WHERE e.slug = '<slug>' ORDER BY pt."createdAt" DESC LIMIT 5;

-- Le vote : paidAt renseigné, non annulé, votesCount = 1
SELECT v.id, v."votesCount", v."paidAt", v."cancelledAt"
FROM "Vote" v JOIN "Event" e ON e.id = v."eventId"
WHERE e.slug = '<slug>' ORDER BY v."createdAt" DESC LIMIT 5;

-- Le portefeuille : une écriture VOTE_CREDIT (disponible) et une HELD_ALLOCATION (réserve) liées au paiement
SELECT le.kind, le."amountCfa", le.direction, le.bucket, le."paymentId", le."createdAt"
FROM "WalletLedgerEntry" le JOIN "OrganizerWallet" w ON w.id = le."walletId"
JOIN "Event" e ON e."tenantId" = w."tenantId"
WHERE e.slug = '<slug>' ORDER BY le."createdAt" DESC LIMIT 5;
```

- [ ] `status = SUCCEEDED`, `commissionCfa` = taux figé par le contrat du concours (`Event.commissionBps`, 12 % par défaut : 12 FCFA sur 100), arrondi à l'inférieur.
- [ ] Le vote compte sur `/e/<slug>/results` (+1 voix).
- [ ] Une seule écriture `VOTE_CREDIT` et une seule `HELD_ALLOCATION` pour ce `paymentId` ; leur somme = montant − commission.

4. **Idempotence** : relancer la vérification du même paiement (rafraîchir l'écran de statut, ou rejouer le webhook FeexPay depuis le tableau de bord PSP s'il le permet). Relancer les trois requêtes :
   - [ ] toujours **une** transaction, **un** vote, une seule paire d'écritures de portefeuille ; le compteur public n'a pas bougé.
5. **Échec** : lancer un paiement puis l'annuler ou le laisser expirer chez le PSP.
   - [ ] `status = FAILED`, aucun vote compté, aucune écriture de portefeuille.

## 2. Live (100 FCFA réels)

Basculer les clés en live, redéployer, revérifier `/health/ready`.

1. Payer **1 voix à 100 FCFA** avec un vrai numéro Mobile Money (MTN, Moov ou Celtiis selon le PSP), valider la demande sur le téléphone.
2. Rejouer les trois requêtes de l'étape 1.
   - [ ] Mêmes résultats qu'en sandbox ; `providerRef` correspond à la référence affichée par le PSP.
   - [ ] Le débit de 100 FCFA apparaît sur le téléphone et dans le tableau de bord du PSP.
3. Clôturer le concours (ou attendre la clôture automatique), puis, après le délai de libération (48 h par défaut, `/admin/offers`), vérifier que la réserve est passée en disponible :

```sql
SELECT w."withdrawableCfa", w."heldCfa"
FROM "OrganizerWallet" w JOIN "Event" e ON e."tenantId" = w."tenantId"
WHERE e.slug = '<slug>';
```

4. Côté organisateur, demander un retrait du disponible ; côté admin (`/admin/offers/withdrawals`), l'approuver, afficher le numéro, payer, puis le marquer payé.
   - [ ] La demande passe `PENDING` → `APPROVED` → `PAID` ; une écriture `WITHDRAWAL_DEBIT` apparaît ; le solde baisse du même montant.
   - [ ] « Marquer payé » ne déclenche **aucun** virement : faire le virement réel hors plateforme, puis seulement marquer payé.
5. Réconciliation : `/admin` → écart journal / soldes à **0**.

## 3. Résultat

- Tout coché → réserve levée, verdict **GO**. Archiver les références PSP et les captures des requêtes.
- Une case non cochée → ne pas ouvrir au public ; voir `docs/runbooks/payment-webhook-outage.md`, garder les paiements en sandbox, et ouvrir un ticket avec les résultats des requêtes.

## Retour arrière

Revenir à une révision précédente (Cloud Run). Si des événements utilisent un des styles de page ajoutés le 2026-10-25, les repasser d'abord en `AFFICHE` (l'ancien client Prisma ne connaît pas ces valeurs) :

```sql
UPDATE "Event" SET "pageStyle"='AFFICHE'
WHERE "pageStyle" IN ('MARCHE','MENU','WAX','CAMPUS','BADGE','STORY','SANCTUAIRE');
```
