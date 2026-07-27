# Processus RGPD VotezPro

## Objectif

Définir le traitement opérationnel des demandes de confidentialité, d'export et de suppression de données pour la plateforme VotezPro.

## Flux de demande

1. Réception de la demande via le support officiel.
2. Vérification d'identité du demandeur.
3. Qualification de la demande (accès, rectification, export, suppression).
4. Exécution technique avec traçabilité dans `AuditLog`.
5. Réponse au demandeur dans le délai réglementaire.

## Droit d'accès et d'export

- Extraire les données utilisateur pertinentes (compte, sessions actives, activités, transactions liées).
- Livrer les données dans un format exploitable et sécurisé.
- Journaliser l'action d'export dans les logs d'audit.

## Droit à l'effacement

- Vérifier les obligations légales de conservation applicables (notamment paiement).
- Purger les données éligibles via les jobs de maintenance.
- Pseudonymiser ou supprimer les traces non légalement conservables.
- Journaliser la suppression et la portée d'exécution.

## Incident de sécurité

- Détecter et qualifier l'incident.
- Isoler la portée (tenants, utilisateurs, données concernées).
- Notifier les parties prenantes internes.
- Préparer la notification réglementaire dans le délai requis.

## Références

- `docs/runbooks/api-outage.md`
- `docs/runbooks/payment-webhook-outage.md`
- `docs/checkpoints/CHECKPOINT-Sprint-Maintenance-Audit.md`
