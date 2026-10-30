# Contrat organisateur signé et nettoyage du parcours — conception

Date : 2026-10-28 · Branche : `chore/zero-risk` · Statut : en attente de validation

## 1. Intention

SHADOMA encaisse l'argent des votes et des billets pour le compte des organisateurs (offre ESCROW).
Le risque principal est un litige d'argent : un organisateur qui veut partir avec l'argent des votes,
ou qui réclame la part de la plateforme comme la sienne.

Réponse voulue par le propriétaire :

> « L'inscription se fait simplement et normalement. Aucun abonnement ne doit plus exister sur la
> plateforme. Retire l'histoire des 0 F d'activation. Une fois ses configurations faites,
> l'organisateur peut mettre son concours en ligne, mais il doit lire et signer le contrat généré par
> la plateforme avec sa signature numérique pour valider l'événement et sa mise en ligne. Il pourra
> télécharger le PDF du contrat autant de fois qu'il veut. Après ça, tout le reste se gère
> normalement. »

Le contrat signé est la pièce qu'on sort en cas de souci. Il doit donc être **figé, daté, attribuable
à une personne identifiée, et impossible à modifier après coup sans que ça se voie**.

## 2. Objectifs

1. Inscription simple : prénom, nom, téléphone, email, mot de passe (nom de l'organisation facultatif), politique de confidentialité. Plus aucun choix d'offre.
2. Plus aucune trace d'abonnement, de formule ou de plan, ni côté organisateur ni côté admin, ni dans l'API.
3. Plus de forfait d'activation (ni payant ni « 0 F »), et donc plus d'offre partenaire liée à ce forfait.
4. Mise en ligne d'un concours = contrat lu et signé numériquement pour **ce** concours.
5. PDF du contrat signé téléchargeable à volonté par l'organisateur, et par l'admin.
6. Correction des incohérences relevées (section 7).

## 3. Non-objectifs

- Signature électronique qualifiée (certificat d'un prestataire agréé). Hors périmètre : on vise une
  signature électronique simple mais solidement prouvée (voir 5.3).
- Rédaction juridique définitive du contrat : le texte fourni est un modèle, à faire relire par un juriste.
- Refonte des paiements (FedaPay/FeexPay), du vote public, de la billetterie publique.

## 4. Anti-objectifs (échec même si « ça marche »)

- Un contrat qu'on peut régénérer avec d'autres chiffres que ceux signés.
- Un organisateur qui met en ligne sans avoir signé (par l'API, un ancien bouton, ou un admin par inadvertance).
- Un texte, bouton, bandeau, notification ou message d'erreur qui parle encore d'abonnement, de formule, d'« Offre 1/2 », de « tenant », de « top-up », ou d'activation à 0 F.
- Un PDF qui change d'une fois à l'autre pour le même contrat.

## 5. Le contrat

### 5.1 Quand

- Un contrat **par concours**, signé au moment de la mise en ligne (passage à « En ligne »).
- Tant qu'il n'est pas signé, le concours peut être préparé (candidats, design, billetterie) mais pas mis en ligne.
- Le refus est appliqué **dans l'API** (passage au statut ACTIVE refusé sans contrat signé), pas seulement dans l'interface.

### 5.2 Contenu (pré-rempli par la plateforme, figé à la signature)

- Parties : SHADOMA (raison sociale, coordonnées : réglage plateforme) et l'organisateur (voir question Q2).
- Le concours : titre, adresse publique, dates, prix du vote, types de billets et prix s'il y en a.
- L'argent :
  - SHADOMA encaisse la totalité des paiements des votes et des billets ;
  - la part de la plateforme (taux et moment du prélèvement, selon le modèle retenu, voir Q1) appartient à SHADOMA et n'est jamais due à l'organisateur ;
  - l'organisateur ne reçoit que sa part, par retrait demandé et validé par un administrateur, vers son numéro Mobile Money enregistré ;
  - délais : réserve, libération après clôture.
- Obligations de l'organisateur (exactitude des informations, pas de fraude au vote, remboursements, etc.) et sanctions (suspension, retenue des fonds en cas de fraude).
- Litiges : droit applicable (Bénin), tribunal compétent.
- Version du modèle, date de génération.

Les chiffres viennent de la configuration **au moment de la signature** et sont enregistrés dans le contrat
lui-même (instantané). Changer un réglage plateforme ensuite ne modifie pas un contrat signé.

### 5.3 Signature numérique (preuve)

Étapes pour l'organisateur :
1. Il lit le contrat (affiché en entier ; le bouton de signature n'apparaît qu'en bas).
2. Il complète les informations d'identité manquantes (Q2).
3. Il tape son nom complet ; il peut aussi tracer sa signature (doigt ou souris), c'est facultatif.
4. Il coche « J'ai lu et j'accepte ce contrat ».
5. Il reçoit un code à 6 chiffres par email et le saisit : c'est ce qui lie la signature à la personne qui contrôle le compte.
6. Le contrat est signé ; le concours passe en ligne.

Enregistré à la signature : instantané JSON du contenu, texte rendu, empreinte SHA-256 de ce texte,
image de la signature, nom tapé, email, utilisateur, date et heure, adresse IP, navigateur, date de
vérification du code. Rien de tout cela n'est modifiable ensuite (aucune route d'édition ; seul un
nouveau contrat peut remplacer l'ancien, et l'ancien reste conservé).

### 5.4 PDF

- Généré côté API une seule fois, à la signature ; ces octets sont conservés avec leur empreinte
  SHA-256 et c'est ce fichier original qui est servi à chaque téléchargement. Une copie part par
  email à l'organisateur.
- Contient le contrat, la signature, et une dernière page « Preuve de signature » : nom, email,
  date/heure, IP, empreinte SHA-256, référence du contrat.
- Téléchargeable par l'organisateur du concours (autant de fois que voulu) et par les admins plateforme.

### 5.5 Après signature

- Le prix du vote et les prix des billets existants sont verrouillés (ils sont dans le contrat). (Décision de conception, à confirmer.)
- Les dates restent modifiables ; chaque modification est journalisée. (Décision de conception.)
- Si un changement verrouillé est vraiment nécessaire : nouveau contrat à signer (l'ancien reste archivé).

## 6. Suppressions

Côté API, web, base, tests, textes (FR et EN), menus :

- **Abonnement** : module `subscriptions` (service, contrôleur, garde `AccountPlanGuard`, tarifs, cron),
  demandes de partenariat de compte (`account-partners`), formules (`admin/plans`, `plans-public`),
  routes admin d'abonnement, pages `/dashboard/subscription/*`, `/admin/subscriptions`, `/admin/plans`,
  `/admin/account-partners`, `PlanUpgradeModal`, `use-subscription`, bandeaux et cartes « abonnement /
  formule », règle d'abonnement au vote, appel cron ajouté au worker.
- **Forfait d'activation** : réglage, routes `payments/activation/*`, `ActivationPaymentPanel`,
  porte « forfait requis », textes « activer gratuitement / 0 F ».
- **Offre partenaire par concours** (dette d'activation, paliers) : n'existe que comme alternative au forfait.
- **Anciens versements par période** (`payouts` hors numéro de retrait), planificateur démo.
- **KkiaPay** (ne sait encaisser aucun réseau).
- **Routes sans appelant** listées dans l'inventaire (sauf `health`, `ops/metrics`, webhook FeexPay).
- **Fichiers parasites** : `design-demos/`, `test-results/`, `3 · Résultats-html.zip` (hors git : à confirmer avant suppression).
- **Base** : migration qui supprime les tables d'abonnement, formules, demandes partenaire de compte,
  paliers et dettes partenaire, périodes et versements anciens, colonnes devenues inutiles
  (`activationPaidAt`, `isPartnerEvent`, …). Les valeurs d'énumération historiques (`ACTIVATION`,
  `SUBSCRIPTION`) restent en base pour les anciennes lignes de paiement, sans aucun code qui les produit.

## 7. Incohérences à corriger

| # | Incohérence | Correction |
|---|---|---|
| 1 | Texte d'accueil ≠ modèle de commission appliqué par défaut | Aligner texte, code par défaut et contrat sur le modèle choisi (Q1) |
| 2 | Votes ajoutés par l'organisateur gratuits et retirables tout de suite | Selon Q3 |
| 3 | « Total encaissé » sans les billets, « Versé au solde » avec | Afficher votes et billets séparément + total cohérent |
| 4 | Billets enregistrés « Crédit vote » au portefeuille | Type d'écriture et libellé « billets » |
| 5 | Statistiques : nombre de votes faux (quantité non recopiée sur le paiement) | Recopier la quantité à la création du paiement + corriger les lignes existantes |
| 6–7 | Bandeaux et messages d'abonnement | Supprimés (section 6) |
| 8 | Désactiver ESCROW renvoie vers une offre indisponible | Selon Q4 (si EXTERNAL disparaît, plus de bascule d'offre) |
| 9 | Jargon « Offre 1/2 », « Tenant », « top-up » dans les messages | Messages en français simple |
| 10 | Prix modifiable en plein concours | Verrouillé par le contrat (5.5) |

## 8. Contraintes

- Monorepo existant : NestJS + Prisma (API), Next 15 + Tailwind + shadcn (web). On construit dessus.
- Génération PDF côté API : bibliothèque JavaScript pure, sans navigateur (choix laissé au constructeur, ex. `pdf-lib`).
- Code d'email : réutiliser l'envoi d'email et le mécanisme de code (OTP) déjà présents pour l'authentification.
- Tout passe par les tests existants (API, web, e2e) + nouveaux tests ; zéro erreur de lint ; `npm audit` à 0.
- Pas de données de prod à migrer à ce jour (démo et tests uniquement).

## 9. Laissé au constructeur

Noms des tables et routes, découpage des composants, mise en page exacte du PDF et de l'écran de
signature (dans le style existant de la plateforme), format de stockage de l'image de signature.

## 10. Questions ouvertes (au propriétaire)

- **Q1 — Modèle d'argent** : commission prélevée à chaque paiement avec une part retirable pendant le
  concours (ce que dit l'accueil), ou tout bloqué jusqu'à la clôture avec une retenue à la fin (ce qui
  tourne par défaut) ? Et quel taux ?
- **Q2 — Identité de l'organisateur dans le contrat** : quelles informations exiger à la signature ?
- **Q3 — Votes ajoutés par l'organisateur** : on garde la fonction (avec commission et réserve comme
  les votes publics) ou on la retire ?
- **Q4 — Offre EXTERNAL** (l'organisateur encaisse lui-même via FedaPay) : on la supprime entièrement ?
- **Q5 — Texte juridique** : un juriste fournira-t-il le texte, ou je rédige un modèle à faire relire ?

## 11. Décisions prises (2026-10-29)

- **Q1** : modèle unique « A ». Commission de 12 % par défaut prélevée à chaque paiement confirmé
  (votes, billets, votes ajoutés), frais du prestataire à la charge de SHADOMA ; le reste est partagé
  entre une réserve (50 % par défaut, libérée 48 h après la clôture) et une part retirable. Taux
  particulier possible par organisateur : fixé par l'admin, avec date d'effet, historisé, notifié,
  jamais rétroactif ; un concours publié garde le taux figé par son contrat.
- **Q2** : prénom, nom, téléphone, adresse, type et numéro de pièce d'identité, organisation,
  RCCM/IFU facultatif.
- **Q3** : votes ajoutés par l'organisateur conservés, avec commission et réserve comme les votes publics.
- **Q4** : offre EXTERNAL supprimée (données archivées dans `LegacyArchive` par la migration).
- **Q5** : modèle rédigé par la plateforme, à faire relire par un juriste (`CONTRACT_TEMPLATE_LEGALLY_REVIEWED`).
- **Contrat simplifié** (version `2026-10-30.1`) : 8 articles courts — parties ; objet ; encaissement et
  commission ; part de l'organisateur et retraits ; engagements de l'organisateur ; engagements de
  SHADOMA ; fraude, suspension et fin ; signature électronique, preuve et litiges (loi n° 2017-20
  portant Code du numérique, Acte uniforme OHADA, droit béninois, juridiction configurée).
- **Informations légales de SHADOMA** (raison sociale, forme, adresse, RCCM/IFU, représentant, email,
  juridiction) : variables `PLATFORM_LEGAL_*` et `CONTRACT_JURISDICTION`. Tant qu'elles manquent, le
  contrat affiche « à renseigner » et la signature est refusée en production.

