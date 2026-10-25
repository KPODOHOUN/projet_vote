# Validation visuelle — 2026-10-25

Captures produites par `apps/web/tests/visual/` (projet Playwright séparé, `npx playwright test -c playwright.visual.config.ts`), sur la base e2e, avec des données de validation créées par les specs (jamais par les seeds). Chaque capture listée « regardée » a été ouverte et examinée ; les autres sont marquées « non regardée ».

Limite des captures pleine page : un élément `fixed` (modale, barre d'enregistrement collante) s'imprime à l'endroit du premier écran, au milieu de la capture. Ce n'est pas un défaut de la page.

## Mini-plateformes — dix-sept styles configurables

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
| billet-turquoise (fond image) | Billet · Classique · turquoise, couverture en fond | hub 1280 | conforme | voile à la couleur de l'événement, titre lisible |
| terroir-vert | Terroir · Classique · vert, couverture | hub 1280 | conforme | — |
| stade-rouge | Stade · Festival · rouge, couverture | hub 1280 + 390 | conforme après correction | noms tronqués dans le bandeau des maillots à 390 → voix sous le nom sur mobile |
| lineup-violet | Line-up · Festival · violet, couverture bichromie | hub 1280 | conforme | — |
| diplome-bleu | Diplôme · Gala · bleu | hub 1280 | conforme | — |
| marche-vert | Marché · Classique · vert, couverture | hub 1280 + 390, profil 390, résultats 390 | conforme après correction | nom coupé en plein mot dans l'étiquette à 390 (« Ahouans / ou ») → numéro sous le nom |
| menu-terracotta | Menu · Gala · terracotta, couverture | hub 1280 + 390 | conforme | — |
| wax-ocre | Wax · Festival · ocre, couverture | hub 1280 + 390 | conforme | — |
| campus-violet | Campus · Festival · violet, couverture | hub 1280 + 390 | conforme | — |
| badge-indigo | Badge · Classique · indigo, couverture | hub 1280 + 390 | conforme | — |
| story-rose | Story · Festival · rose, couverture | hub 1280 + 390 | conforme | — |
| sanctuaire-violet | Sanctuaire · Gala · violet, couverture | hub 1280 + 390 | conforme | — |
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

## Accessibilité — mini-plateformes et éditeur (2026-10-25)

Spec `tests/e2e/a11y-minisite.spec.ts` (suite e2e) : axe-core, règles WCAG 2.0/2.1/2.2 A et AA, et défilement horizontal, à 390 px, sur l'accueil, le profil et les résultats des dix-sept styles (couleurs claire, moyenne et sombre en alternance), puis sur l'éditeur d'apparence. Rapport détaillé : `a11y-violations.json` dans `test-results/`.

| Constat (premier passage) | Pages | Correction |
|---|---|---|
| Texte d'accent à 3,7–4,4:1 sur les fonds teintés (sur-titres, « Candidat n° », numéros) | 11 styles clairs | `--event-accent-ink` (`deriveAccentInk`, testé sur tous les fonds clairs) |
| Sélecteur de langue du bandeau à 4,44:1 (opacité 0,85) | Billet, Pop | pleine couleur d'en-tête |
| Numéro blanc sur la carte Magazine sans photo, 1,34:1 | Magazine | voile sombre en haut de la carte |
| Boutons enfants directs d'un `<dl>` | Affiche | boutons hors du `<dl>` |
| `--color-muted-foreground` (slate-500) à 4,34:1 sur `--color-muted` | éditeur, application | token passé à slate-600 |
| Zone d'aperçu défilante non atteignable au clavier | éditeur | `tabIndex=0`, `role=region`, libellé |
| Échantillon de l'éditeur : sur-titre et lien en accent foncé sur fond teinté, 4,3:1 | éditeur | `accentInk`, comme les pages publiques |

Second passage : aucune violation, aucun défilement horizontal. Non couvert par axe : lecteur d'écran réel, zoom 400 %, navigation complète au clavier du parcours de paiement (à vérifier à la main).
