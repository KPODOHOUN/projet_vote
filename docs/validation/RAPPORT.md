# Validation visuelle — 2026-10-25

Captures produites par `apps/web/tests/visual/` (projet Playwright séparé, `npx playwright test -c playwright.visual.config.ts`), sur la base e2e, avec des données de validation créées par les specs (jamais par les seeds). Chaque capture listée « regardée » a été ouverte et examinée ; les autres sont marquées « non regardée ».

Limite des captures pleine page : un élément `fixed` (modale, barre d'enregistrement collante) s'imprime à l'endroit du premier écran, au milieu de la capture. Ce n'est pas un défaut de la page.

## Mini-plateformes — styles configurables (Affiche, Soirée, Billet)

L'organisateur choisit dans l'éditeur d'apparence : logo, couleur, image de couverture, style de page et police des titres (Festival = Unbounded, Gala = Playfair Display, Classique = Plus Jakarta Sans). Six événements de validation couvrent les trois styles, les trois polices et des cas limites. Les candidats n'ont pas de photo (initiales) : aucune photo de personne n'a été ajoutée aux données de test.

L'image de couverture de « affiche-or » est une photo de concert Wikimedia Commons (« Beach-Please-2022-crowd-stage-lights-night-performance », PinkBeachPlanet, CC BY-SA 4.0), utilisée uniquement pour ces captures. Elle n'est pas dans le dépôt : la spec la lit via `VISUAL_COVER_PATH`.

| Événement | Style · police · couleur | Pages regardées | Verdict | Défaut observé → correction |
|---|---|---|---|---|
| affiche-or | Affiche · Festival · or, avec couverture | hub 1280 + 390 | conforme après correction | compte à rebours en capitales et coupé, slogan or peu lisible sur la photo, débordement de 2 px à 390, numéros « 01 » cassés sur deux lignes → casse normale, sans retour, pleine largeur sur mobile ; slogan blanc ; numéro non sécable |
| soiree-or | Soirée · Gala · or | hub 1280 + 390, profil 1280, résultats clos 1280 | conforme après correction | bouton d'action en or foncé (variables du thème posées en ligne) → accent éclairci posé en ligne en Soirée ; carte de paiement claire et opaque |
| soiree-bleu-nuit | Soirée · Festival · `#1B2A6B` | résultats 1280 | conforme | l'accent bleu nuit est éclairci (≥ 4,5:1 sur le fond nuit) |
| billet-turquoise | Billet · Classique · turquoise | hub 1280, profil 390 | conforme | — |
| billet-blanc | Billet · Festival · blanc, liste | hub 390 | conforme après correction | bandeau blanc confondu avec le fond, double filet au-dessus de la liste → filet sous le bandeau, un seul filet |
| affiche-sans-photo | Affiche · Gala · défaut | non regardée | — | captures présentes |

Critère « un votant comprend qui il paie et combien » : **oui** dans les trois styles (nom du candidat en titre, prix d'un vote, total au-dessus du bouton « Payer »). Le bouton « Copier le lien » est neutre dans tous les styles (le défaut violet relevé plus tôt n'apparaît plus).

Toutes les captures ont été refaites après ces correctifs ; les pages à 390 px font exactement 390 px de large (aucun défilement horizontal).

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
