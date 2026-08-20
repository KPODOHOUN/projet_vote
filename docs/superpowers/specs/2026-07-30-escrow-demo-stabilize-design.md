# Escrow + paiements démo — stabilisation phase test

Date: 2026-07-30  
Statut: validé

## Objectif

Pendant la phase de test, seule l’offre 2 (Escrow) est disponible. Les paiements
passent en mode démo (aucun débit Mobile Money réel). L’offre 1 (External) reste
en réflexion et ne peut pas être choisie ni utilisée.

## Décisions

1. **Offre 2 Escrow** = parcours unique d’inscription et d’exploitation.
2. **Offre 1 External** = désactivée (`offer1_external_enabled=false`), UI
   « En réflexion », refus API à l’inscription et au switch.
3. **Paiements démo** via `API_PAYMENT_DEMO_MODE=true` en local/test uniquement.
   Interdit en `NODE_ENV=production` (déjà garanti par `env.ts`).
4. **Votes / activation** : confirmation auto en démo → effets wallet Escrow
   réels (pending → clôture → available).
5. **Retraits** : demande organisateur → validation admin → marquage « payé en
   démo » (manuel, pas de payout PSP).
6. **Prod** : Escrow reste le modèle ; désactiver le flag démo et brancher les
   PSP plateforme. Offre 1 ne se réactive qu’après décision produit.

## Hors scope

- Split FedaPay / payout instantané Offre 1
- Payout PSP automatique des retraits Escrow
- Réactivation Offre 1
