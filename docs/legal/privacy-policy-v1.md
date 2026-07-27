# Politique de confidentialité — SHADOMA Votes

**Version : 1.0**
**Date d'effet : 2 juin 2026**

## 1. Données collectées

Lorsqu'un votant participe à un concours sur SHADOMA Votes, nous collectons :
- **Numéro de téléphone** : utilisé uniquement sous forme de **hash salé SHA-256**, jamais en clair. Les 4 derniers chiffres sont conservés pour faciliter le support.
- **Référence de paiement FeexPay** : pour rapprocher chaque vote du paiement Mobile Money correspondant.
- **Horodatage** et **concours concerné**.

Pour les organisateurs :
- **Email** et **structure** (nom de l'organisation).
- **Logs d'activité** (création de concours, modifications, paiements).

## 2. Finalités

- Permettre le vote payant et son décompte fiable.
- Encaisser les paiements via FeexPay.
- Prévenir la fraude.
- Respecter les obligations légales (BCEAO, RGPD pour les ressortissants UE).

## 3. Protection

- Numéros de téléphone hachés (impossibles à recalculer en clair).
- Secrets de paiement chiffrés AES-256-GCM.
- Isolation stricte entre organisateurs (un organisateur n'accède jamais aux données d'un autre).
- Communications HTTPS uniquement.

## 4. Durée de conservation

- Données de vote : durée du concours + 13 mois (obligation comptable BCEAO).
- Logs d'audit : 12 mois minimum.
- Suppression automatique au-delà.

## 5. Vos droits

Tout votant peut demander à `privacy@shadowa-votes.com` :
- Une copie des données le concernant.
- La suppression de ces données (RGPD, droit à l'oubli).

Les organisateurs disposent d'un export complet via leur espace personnel.

## 6. Sous-traitants

- **FeexPay** (Bénin) : traitement des paiements Mobile Money.
- **Cloud d'hébergement** : voir page "À propos" pour le détail.

## 7. Contact

Délégué protection des données : `privacy@shadowa-votes.com`
