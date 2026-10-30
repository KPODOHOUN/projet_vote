# TODO — points ouverts avant la mise en production

Le système d'abonnement, le forfait d'activation et l'offre EXTERNAL ont été supprimés le 29/10/2026
(ADR-022) ; leurs données sont archivées dans `LegacyArchive`.

## Bloquant pour signer des contrats en production

- [ ] Renseigner les informations légales de SHADOMA (variables d'environnement de l'API) :
      `PLATFORM_LEGAL_NAME`, `PLATFORM_LEGAL_FORM`, `PLATFORM_LEGAL_ADDRESS`,
      `PLATFORM_LEGAL_REGISTRATION` (RCCM / IFU), `PLATFORM_LEGAL_REPRESENTATIVE`,
      `PLATFORM_LEGAL_EMAIL`, `CONTRACT_JURISDICTION` (ex. « Tribunal de commerce de Cotonou »).
      Tant qu'elles manquent, la signature est refusée en production.
- [ ] Faire relire le modèle de contrat (`apps/api/src/contracts/contract-template.ts`, version
      `2026-10-30.1`) par un juriste béninois, puis passer `CONTRACT_TEMPLATE_LEGALLY_REVIEWED=true`.
- [ ] Configurer l'envoi d'emails (`MAIL_RESEND_API_KEY`) : sans lui, le code de signature ne part pas
      et la signature est impossible en production.

## Déploiement

- [ ] **Sauvegarder la base**, puis appliquer les migrations `20261029100000_contract_finance_cleanup`,
      `20261029110000_backfill_counts_ledger_labels` et `20261030160000_payout_cooldown_archived_reserve`
      (automatique au démarrage du conteneur `apps/api/Dockerfile`) : la première archive les anciennes
      données dans `LegacyArchive` avant de supprimer les tables, la deuxième corrige les lignes
      existantes, la troisième ajoute le délai de 24 h sur le numéro de retrait.
- [ ] Choisir l'hébergeur et poser les variables de production (voir `docs/deployment/staging-production.md`) :
      en production, l'API exige `API_REDIS_URL` **ou** `API_SINGLE_INSTANCE=true`.
- [ ] Déployer le worker cron **en même temps** que l'API (nouvelle signature des appels cron).
- [ ] Dérouler `docs/runbooks/premier-paiement-reel.md` (sandbox puis live 100 FCFA).
