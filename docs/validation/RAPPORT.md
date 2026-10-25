# Validation visuelle — 2026-10-25

Captures produites par `apps/web/tests/visual/` (projet Playwright séparé, `npx playwright test -c playwright.visual.config.ts`), sur la base e2e, avec des données de validation créées par les specs (jamais par les seeds). Chaque capture listée « regardée » a été ouverte et examinée ; les autres sont marquées « non regardée ».

Limite des captures pleine page : un élément `fixed` (modale, barre d'enregistrement collante) s'imprime à l'endroit du premier écran, au milieu de la capture. Ce n'est pas un défaut de la page.

## Mini-plateformes — six styles configurables

L'organisateur choisit dans l'éditeur d'apparence : logo, couleur, image de couverture, style de page (Affiche, Soirée, Billet, Couronne, Magazine, Pop) et police des titres (Festival = Unbounded, Gala = Playfair Display, Classique = Plus Jakarta Sans). Six événements de validation, un par style, chacun avec un **logo de démonstration** (monogramme « MC » d'un concours fictif) importé par la vraie route d'import (stockage en base). Les candidats n'ont pas de photo (initiales) : aucune photo de personne n'a été ajoutée aux données de test.

Couverture des styles Affiche, Couronne et Magazine : photo de concert Wikimedia Commons (« Beach-Please-2022-crowd-stage-lights-night-performance », PinkBeachPlanet, CC BY-SA 4.0), utilisée uniquement pour ces captures, hors dépôt (`VISUAL_COVER_PATH`, logo : `VISUAL_LOGO_PATH`).

| Événement | Style · police · couleur | Pages regardées | Verdict | Défaut observé → correction |
|---|---|---|---|---|
| affiche-or | Affiche · Festival · or, couverture | hub 1280 + 390 | conforme après correction | compte à rebours en capitales et coupé, slogan peu lisible sur la photo, débordement de 2 px à 390, numéros cassés → corrigés |
| soiree-or | Soirée · Gala · or | hub 1280 + 390, profil 1280, résultats clos 1280 | conforme après correction | bouton en or foncé → accent éclairci posé en ligne |
| billet-turquoise | Billet · Classique · turquoise | hub 1280, profil 390 | conforme | — |
| couronne-rose | Couronne · Gala · rose, couverture | hub 1280 | conforme | — |
| magazine-rouge | Magazine · Festival · rouge, couverture | hub 1280 | conforme après correction | titre coupé au milieu des mots dans la demi-colonne → taille calée sur la colonne, coupure aux espaces et tirets |
| pop-orange | Pop · Festival · orange | hub 1280 + 390 | conforme | — |
| panneau de partage | profil Affiche, téléphone | 390 | conforme après correction | lien entièrement surligné à l'ouverture → focus sur « Copier » |

Partage : bouton « Partager » sur le bandeau, le profil et les résultats ; panneau avec le lien copiable, 13 réseaux avec leurs logos officiels (Messenger sur téléphone seulement), e-mail, SMS et « Autres applications » (partage natif). Critère « un votant comprend qui il paie et combien » : **oui** dans les six styles.

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
