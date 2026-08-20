# ADR-019 — Settlement Offre EXTERNAL / ESCROW

**Date :** 2026-07-29  
**Statut :** Accepté

## Contexte

Remplacement du produit Plans/Partenaire par deux offres de règlement.

## Décision

- **EXTERNAL** : settlement split (payin plateforme + payout immédiat net orga) quand `supportsSplit` ; gate création event sinon.
- **ESCROW** : wallet pending → clôture (retenue) → available → retrait admin.
- Auth : OTP e-mail (plus de magic links) ; auto-login post-vérification.

## Conséquences

- Migration tenants via `packages/db/prisma/migrate-offers.ts`
- UI Plans redirigée vers `/admin/offers`
- Flags PSP overridables admin
