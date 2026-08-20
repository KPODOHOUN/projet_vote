# Offres EXTERNAL / ESCROW — Design

**Date :** 2026-07-29  
**Statut :** Approuvé

## Objectif

Remplacer Plans + Partenaire produit par **deux offres** choisies à l’inscription, avec dashboards orga/admin clairs (CRUD), stats par événement, paiements confirmés uniquement.

## Offres

### Offre 1 — EXTERNAL
- Fonds vers le compte orga via mécanisme split/settlement PSP
- Commission plateforme configurable (admin) ; déduite à chaque transaction
- Pas d’événement sans PSP `supportsSplit` + credentials / destination payout
- Ajout de votes orga : payer **uniquement la commission plateforme** (min affiché)

### Offre 2 — ESCROW
- Fonds encaissés plateforme → `OrganizerWallet`
- Clôture event (auto `endsAt` ou manuel) → retenue % configurable
- Commission/vote optionnelle (admin)
- Retrait : bouton → validation admin
- Ajout de votes orga : payer **nombre × prix** → crédit wallet + votes

## Règles

- Changement 1→2 : aucun event actif
- Changement 2→1 : aucun event actif + solde 0 + pas de retrait pending
- Prix de vote fixe (pas de packs) ; classement candidats auto par votes desc
- Votes : ajouter oui, retirer non ; crédit seulement si paiement `SUCCEEDED`

## Données

- `Tenant.offerType` : EXTERNAL | ESCROW
- `OrganizerWallet`, `WalletLedgerEntry`, `WithdrawalRequest`
- `Event.closedAt`
- `PlatformSetting` : enable offers, rates, `psp_*_supports_split`
- `PaymentPurpose.ORGANIZER_VOTE_TOPUP`

## Settlement Offre 1 (réaliste)

Audit courant FeexPay / FedaPay / KkiaPay : **pas de split multi-bénéficiaires natif** dans l’intégration actuelle.  
Mécanisme retenu quand un provider est flagué `supportsSplit` :

1. Payin sur compte plateforme
2. À la confirmation : commission plateforme conservée ; **payout immédiat** du net vers la destination MoMo orga
3. Les fonds ne restent pas en wallet escrow (contrairement à Offre 2)

Admin active le flag provider seulement après validation opérationnelle.

## UI

- Orga : liste events → fiche (Classement / Argent / Activité) + bandeau indicateurs
- Admin CRUD : Offres & tarifs, Events actifs, Retraits, Users, Revenus, OTP
- Parcours ≤ 2–3 clics ; zéro fake data

## Migration

- Partenaire / isPartnerEvent → ESCROW
- BYO clé sans partenaire → EXTERNAL
- Défaut → ESCROW
- Masquer UI Plans / Partenaire produit
