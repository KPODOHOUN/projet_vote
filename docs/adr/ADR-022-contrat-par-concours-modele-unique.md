# ADR-022 — Contrat signé par concours et modèle financier unique

**Date :** 2026-10-29
**Statut :** Accepté
**Remplace :** [ADR-019](./ADR-019-settlement-offers.md) (offres EXTERNAL / ESCROW), [audit split PSP](./ADR-018-psp-split-audit.md) ; complète [ADR-020](./ADR-020-settlement-finance-model.md) (la réserve et sa libération sont conservées).
**Conception détaillée :** [`docs/superpowers/specs/2026-10-28-contrat-organisateur-et-nettoyage-design.md`](../superpowers/specs/2026-10-28-contrat-organisateur-et-nettoyage-design.md)

## Contexte

Trois mécanismes se superposaient pour autoriser un organisateur à encaisser : abonnements et plans,
forfait d'activation par concours (y compris « 0 F »), et deux offres de règlement (EXTERNAL, où
l'organisateur encaissait via un sous-compte FedaPay, et ESCROW). Le parcours était incohérent et rien
ne prouvait l'accord de l'organisateur sur la commission en cas de litige.

## Décision

1. **Plus d'abonnement, de plan, de forfait d'activation ni d'offre EXTERNAL.** Modèles, routes, écrans
   et réglages supprimés ; les lignes existantes sont copiées dans `LegacyArchive` avant suppression
   (migration `20261029100000_contract_finance_cleanup`).
2. **Un seul modèle d'argent.** SHADOMA encaisse tout sur son compte prestataire. À chaque paiement
   confirmé, la commission (12 % par défaut, `floor`) est figée sur la transaction ; le net est crédité
   au portefeuille, partagé entre réserve et part retirable. Taux applicable : celui figé par le contrat
   du concours, sinon le taux négocié en vigueur (`CommissionRate`, historisé, jamais rétroactif), sinon
   le défaut plateforme.
   **Billets (31/10/2026)** : taux distinct, 10 % par défaut (`ticket_commission_bps`, réglable par
   l'admin, hors fourchette 4–12 % par le super-admin seulement), figé par le contrat
   (`Event.ticketCommissionBps`, modèle `2026-10-31.2`). Un contrat antérieur sans taux billets garde
   son taux unique sur tous les paiements (rempli par la migration `20261031140000_ticket_commission`).
3. **Mise en ligne = signature du contrat.** Le passage DRAFT → ACTIVE n'existe que dans la transaction
   de signature (`assertEventTransition(…, "contract")`). Le contrat est généré à partir d'un instantané
   figé (texte + SHA-256), signé par case à cocher, nom saisi et code envoyé par email (signature dessinée
   facultative). Le PDF signé est produit une fois, conservé avec son empreinte, servi à l'identique et
   envoyé par email.

## Conséquences

- Les paiements historiques `ACTIVATION` / `SUBSCRIPTION` restent lisibles (valeurs d'enum conservées) ;
  confirmés tardivement, ils ne créditent rien.
- Le texte du contrat dépend d'informations légales de la plateforme (`PLATFORM_LEGAL_*`) : signature
  refusée en production tant qu'elles manquent. Le modèle doit être relu par un juriste
  (`CONTRACT_TEMPLATE_LEGALLY_REVIEWED`).
- La signature électronique est « simple » (Code du numérique du Bénin) : sa force probante repose sur les
  éléments conservés (code email, IP, navigateur, empreinte, horodatage), pas sur un certificat qualifié.
