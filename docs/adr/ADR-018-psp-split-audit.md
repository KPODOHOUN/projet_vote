# PSP Split capability audit — 2026-07-29

## Verdict

- **FedaPay Marketplace** : split natif via sous-comptes et
  `sub_accounts_commisssions`. Compatible par défaut après validation KYC du
  sous-compte organisateur.
- **FeexPay** : pas de split natif vérifiable dans l'intégration actuelle.
  Incompatible par défaut.
- **KkiaPay** : pas de split natif vérifié. Incompatible par défaut.

## Product mapping

Offre 1 « External » = **split natif FedaPay Marketplace** :
1. l'organisateur soumet sa référence `acc_...` ;
2. un opérateur plateforme contrôle le KYC et valide cette référence ;
3. le payin est créé sur le compte Marketplace plateforme avec le net destiné au sous-compte ;
4. le pull serveur-à-serveur vérifie statut, montant, devise, bénéficiaire et montant du split ;
5. aucune confirmation locale n'est appliquée si un invariant diffère.

Flags overridables via `PlatformSetting` :
- `psp_fedapay_supports_split` peut désactiver temporairement FedaPay ;
- les flags FeexPay/KkiaPay ne peuvent pas être activés par l'administration
  tant qu'une intégration native vérifiable n'existe pas.

Gate création d’événement Offre 1 : provider FedaPay + sous-compte soumis et validé.
