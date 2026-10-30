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

- [ ] Appliquer les migrations `20261029100000_contract_finance_cleanup` puis
      `20261029110000_backfill_counts_ledger_labels` (automatique au démarrage du conteneur API) :
      la première archive les anciennes données dans `LegacyArchive` avant de supprimer les tables,
      la seconde corrige les lignes existantes (quantité de votes, écritures de billets, libellés).
