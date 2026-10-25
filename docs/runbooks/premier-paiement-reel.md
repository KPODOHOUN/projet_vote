# Premier paiement réel — procédure de validation

Dernière réserve avant la mise en production : aucun test automatisé ne remplace une vraie transaction chez un PSP. Cette procédure la lève en deux temps (sandbox, puis live pour 100 FCFA) et dit, à chaque étape, quoi vérifier et où.

Durée : 30 à 45 minutes. Il faut : un accès admin, un accès lecture à la base de production (Neon), un téléphone Mobile Money réel pour l'étape live.

## 0. Préparation

- [ ] Dernier `main` déployé, CI verte, `GET /api/v1/health/ready` → `200` avec `checks.database: "ok"`.
- [ ] `API_PAYMENT_DEMO_MODE=false` en production (le démarrage est refusé sinon, mais vérifier la variable).
- [ ] Clés PSP **plateforme** posées ; noter le préfixe : FeexPay `test_` = sandbox, `fp_` = live. FedaPay / KKiaPay : `*_BASE_URL` sandbox ou live.
- [ ] Un événement Escrow de test, **activé**, avec 2 candidats, prix du vote **100 FCFA**. Noter son slug.

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

-- Le portefeuille : une écriture VOTE_CREDIT liée au paiement
SELECT le.kind, le."amountCfa", le.direction, le.bucket, le."paymentId", le."createdAt"
FROM "WalletLedgerEntry" le JOIN "OrganizerWallet" w ON w.id = le."walletId"
JOIN "Event" e ON e."tenantId" = w."tenantId"
WHERE e.slug = '<slug>' ORDER BY le."createdAt" DESC LIMIT 5;
```

- [ ] `status = SUCCEEDED`, `commissionCfa` = 10 % du montant (offre Escrow).
- [ ] Le vote compte sur `/e/<slug>/results` (+1 voix).
- [ ] Une seule écriture `VOTE_CREDIT` pour ce `paymentId`.

4. **Idempotence** : relancer la vérification du même paiement (rafraîchir l'écran de statut, ou rejouer le webhook FeexPay depuis le tableau de bord PSP s'il le permet). Relancer les trois requêtes :
   - [ ] toujours **une** transaction, **un** vote, **une** écriture `VOTE_CREDIT` ; le compteur public n'a pas bougé.
5. **Échec** : lancer un paiement puis l'annuler ou le laisser expirer chez le PSP.
   - [ ] `status = FAILED`, aucun vote compté, aucune écriture de portefeuille.

## 2. Live (100 FCFA réels)

Basculer les clés en live, redéployer, revérifier `/health/ready`.

1. Payer **1 voix à 100 FCFA** avec un vrai numéro Mobile Money (MTN, Moov ou Orange), valider la demande sur le téléphone.
2. Rejouer les trois requêtes de l'étape 1.
   - [ ] Mêmes résultats qu'en sandbox ; `providerRef` correspond à la référence affichée par le PSP.
   - [ ] Le débit de 100 FCFA apparaît sur le téléphone et dans le tableau de bord du PSP.
3. Clôturer l'événement (ou attendre la clôture par le cron), puis vérifier que le solde passe en disponible :

```sql
SELECT w."withdrawableCfa", w."heldCfa"
FROM "OrganizerWallet" w JOIN "Event" e ON e."tenantId" = w."tenantId"
WHERE e.slug = '<slug>';
```

4. Côté organisateur, demander un retrait du disponible ; côté admin (`/admin/retraits`), l'approuver puis le marquer payé.
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
