# Plan d'exécution — refonte contrat, finance A, nettoyage (2026-10-29)

Référence : `docs/superpowers/specs/2026-10-28-contrat-organisateur-et-nettoyage-design.md` + cahier des charges du propriétaire (29/10).

Décisions tranchées par le propriétaire : modèle financier A ; commission par défaut 12 % (centralisée,
taux particulier par organisateur fixé par l'admin, historisé, date d'effet, jamais rétroactif) ;
offre EXTERNAL supprimée ; contrat = modèle centralisé versionné, non validé juridiquement ; infos
légales manquantes = configuration explicite + point bloquant documenté.
Décision de conception : les votes ajoutés par l'organisateur sont conservés mais suivent les mêmes
règles que les votes publics (commission + réserve).

Ordre (le code compile à chaque étape, le schéma change en dernier) :
1. Abonnement : module `subscriptions` (+ account-partners, plans), pages, composants, textes, cron.
2. Forfait d'activation + offre partenaire par concours (dette, paliers).
3. EXTERNAL : offre, bascule, sous-comptes FedaPay, split, clés PSP organisateur ; KkiaPay.
4. Anciens versements par période (garder numéro de retrait + verrou de traitement).
5. Finance A : 12 %, réserve, historique des taux, votes ajoutés, billets, quantité de votes.
6. Contrat : modèle versionné, génération, signature (code email), empreinte, PDF, porte de publication, verrou du prix.
7. Inscription : prénom, nom, téléphone, email, mot de passe.
8. Incohérences : totaux, jargon, menus admin, routes mortes, maintenance/purge.
9. Schéma + migration (archive JSON des lignes supprimées, puis suppression), seed.
10. Tests (API, web, e2e), vérifications en direct, documentation, compte rendu.
