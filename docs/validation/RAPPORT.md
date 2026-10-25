# Validation visuelle — 2026-10-25

Captures produites par `apps/web/tests/visual/` (projet Playwright séparé, `npx playwright test -c playwright.visual.config.ts`), sur la base e2e, avec des données de validation créées par les specs (jamais par les seeds). Chaque capture listée « regardée » a été ouverte et examinée ; les autres sont marquées « non regardée ».

Limite des captures pleine page : un élément `fixed` (modale, barre d'enregistrement collante) s'imprime à l'endroit du premier écran, au milieu de la capture. Ce n'est pas un défaut de la page.

## Mini-plateformes (5 palettes : défaut, or, sombre `#0F172A`, turquoise, blanc saisi)

| Page | 390 | 1280 | Verdict | Défaut observé → correction |
|---|---|---|---|---|
| Hub défaut | regardée | — | conforme après correction | « 1 votes » alors que les résultats comptaient 42 → l'API comptait des lignes, pas les voix (`a28c913`) ; « voix » invariable ; double pied de page → pied du site masqué sur `/e/*` |
| Hub sombre | — | regardée | conforme | — |
| Profil or | regardée | — | conforme après correction | quantité sélectionnée en indigo, bouton « Payer » en or → une seule couleur d'action (`ee66bfb`) |
| Profil turquoise | regardée | — | conforme après correction | bouton « Copier le lien » teinté violet → bouton neutre bordé (`8907a1e`) |
| Résultats or (en cours) | regardée | — | conforme | classement provisoire, aucun vainqueur nommé |
| Résultats clos | — | regardée | conforme | vainqueur, places 2–4, part des voix ; aucun montant |
| Autres palettes | non regardée | non regardée | — | captures présentes dans `390/` et `1280/` |

Critère « un votant comprend qui il paie et combien » : **oui** à 390 px (nom du candidat en titre, prix d'un vote, total en grand au-dessus du bouton « Payer {total} »).

## Application

| Page | 390 | 1280 | Verdict | Défaut observé → correction |
|---|---|---|---|---|
| Home | regardée | — | conforme après correction | grand vide sombre au-dessus du titre sur mobile → hauteur du hero réduite sous 768 px |
| Modale d'inscription | regardée | — | conforme | offre Escrow seule, défilement interne |
| Tableau de bord | regardée (×2) | — | conforme après correction | header qui débordait ; bandeau « Encaissement non configuré » faux pour Escrow ; « 3 étapes » avec 4 étapes (`fe68635`) |
| Portefeuille | regardée | — | conforme après correction | numéro de retrait ni affiché ni signalé manquant (`fe68635`) |
| Éditeur d'apparence | regardée | — | conforme après correction | échantillon débordant de la carte (largeur minimale du `fieldset`) → `min-w-0` (`283a49d`) |
| Admin vue d'ensemble | — | regardée | conforme | l'écart journal/soldes signalé est réel : portefeuilles de capture remplis sans écriture de journal |
| Admin retraits | regardée | — | conforme après correction | header : menu sur le sélecteur de langue, « Déconnexion » au bord (`22e2c2c`) ; cartes sous 768 px ; paragraphe « Marquer payé ne déclenche aucun virement » visible |
| Compte, admin maintenance | non regardée | non regardée | — | captures présentes |

Critères : un organisateur voit le disponible et la réserve sans changer d'écran (**oui**) ; un admin ne peut pas croire que « Marquer payé » a envoyé l'argent (**oui**, paragraphe permanent).

Les captures n'ont pas été refaites après les deux derniers correctifs (header admin, `fieldset`) : à relancer pour confirmer.
