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
      `2026-10-31.2`) par un juriste béninois, puis passer `CONTRACT_TEMPLATE_LEGALLY_REVIEWED=true`.
- [ ] Configurer l'envoi d'emails (`MAIL_RESEND_API_KEY`) : sans lui, le code de signature ne part pas
      et la signature est impossible en production.

## Déploiement

- [ ] **Sauvegarder la base**, puis appliquer les migrations `20261029100000_contract_finance_cleanup`,
      `20261029110000_backfill_counts_ledger_labels` et `20261030160000_payout_cooldown_archived_reserve`
      (automatique au démarrage du conteneur `apps/api/Dockerfile`) : la première archive les anciennes
      données dans `LegacyArchive` avant de supprimer les tables, la deuxième corrige les lignes
      existantes, la troisième ajoute le délai de 24 h sur le numéro de retrait.
- [ ] Appliquer aussi `20261031100000_ticket_payment_transaction_index` (index des billets par paiement).
- [ ] Appliquer aussi `20261031120000_ticket_numbers` (numéros lisibles N° 0001… ; numérote les billets déjà payés).
- [ ] Appliquer aussi `20261031140000_ticket_commission` (commission billets 10 % ; les concours déjà publiés gardent leur taux unique contractuel).
- [ ] Rembourser à la main tout paiement tracé `payment.late_success_needs_refund` (paiement confirmé après abandon, sans place libre ou concours fermé).
- [ ] Générer un secret et le poser en `API_EDGE_PROXY_SECRET` (API) et `EDGE_PROXY_SECRET` (front),
      puis vérifier en staging que l'IP d'une session est celle du poste
      (voir `docs/deployment/staging-production.md`).
- [ ] Choisir l'hébergeur et poser les variables de production (voir `docs/deployment/staging-production.md`) :
      en production, l'API exige `API_REDIS_URL` **ou** `API_SINGLE_INSTANCE=true`.
- [ ] Déployer le worker cron **en même temps** que l'API (nouvelle signature des appels cron).
- [ ] Dérouler `docs/runbooks/premier-paiement-reel.md` (sandbox puis live 100 FCFA).
