# DESIGN.md — SHADOMA

Source de vérité du design. Les tokens vivent dans `apps/web/app/globals.css` (`@theme`) ; ce fichier dit comment s'en servir. Tout nouvel écran suit ces règles ; un écart se justifie ici, pas dans le code.

## Principes

1. **Encaissement d'abord.** Sur chaque écran, on sait en cinq secondes qui paie qui, combien, et ce qui n'est pas encore compté.
2. **Une seule structure, un habillage choisi par l'organisateur.** Les mini-plateformes gardent la structure de la maquette `3 · Résultats-html.zip` ; l'organisateur choisit, dans l'éditeur d'apparence, le logo, la couleur, l'image de couverture, le style de page et la police des titres.
3. **Composants existants seulement.** `Button`, `Card`, `Input`, `Select`, `StatusChip`, `FormError`, `LoadingState`, `ConfirmDialog`, `PublicEventShell`, `CandidatePhoto`… On adapte, on ne recrée pas.
4. **Rien d'inventé.** Pas de chiffre, de témoignage, de logo ou d'opérateur qui ne vienne pas des données.

## Matières

| Rôle | Token | Valeur | Usage |
|---|---|---|---|
| Encre | `slate-900` | `#0F172A` | titres, texte principal, filets forts |
| Encre secondaire | `slate-600` | `#475569` | texte d'appui (jamais plus clair pour un texte utile) ; c'est aussi `--color-muted-foreground`, à 4,5:1 sur `--color-muted` (slate-100) |
| Action | `brand-600` / `--color-primary` | `#4F46E5` | bouton principal, lien |
| Repère admin | `gold-600` / `gold-700` | `#D97706` | liseré admin, médaille du 1er — jamais sur un bouton d'argent |
| Succès / erreur / info / alerte | `--color-*-text` | `#047857` / `#DC2626` / `#1D4ED8` / `#B45309` | texte d'état, toujours ≥ 4,5:1 |

Dans une mini-plateforme, `--color-primary` = `--event-accent-strong` (moteur `lib/brand.ts`, ≥ 4,5:1 garanti). La couleur brute de l'événement (`--event-accent`) ne sert qu'aux aplats sans texte (barres, filet sous l'onglet actif). Les textes d'accent des pages `/e/*` (sur-titres, numéros) prennent `--event-accent-ink` via `--mini-accent` : assombri jusqu'à 4,5:1 sur chacun des fonds clairs teintés (`MINI_LIGHT_GROUNDS`, à tenir à jour avec `globals.css`).

## Typographie

- **Plus Jakarta Sans** (`font-display`) : titres de l'application. **Inter** (`font-body`) : texte. **JetBrains Mono** : références de transaction.
- Titres des mini-plateformes, au choix de l'organisateur : **Unbounded** (`--font-festival`, défaut), **Playfair Display** (`--font-gala`), **Plus Jakarta Sans** (« Classique »). Fichiers auto-hébergés (OFL), non préchargés. Classes `mini-title` + `mini-display-xl` / `mini-h1` / `mini-h2` : la taille est corrigée par `--mini-title-scale` (Unbounded est large).
- Titres en romain, jamais d'italique. Un H1 par page.
- Mini-plateformes : titres `mini-title` en capitales, sur-titres `text-[11px] uppercase tracking-[0.24em]`, navigation `text-[11px] uppercase tracking-[0.22em]`.
- Dashboard et admin : titres `text-3xl font-extrabold tracking-tight`, sur-titres en casse normale `text-sm font-semibold text-slate-600`.
- Montants et compteurs en `tabular-nums`, formatés par `lib/format.ts` (`formatCfa`, `formatCount`, `formatEventDate`) dans la locale de la page.

## Formes et espace

- Arrondis `rounded-md`. Pas de `rounded-2xl/3xl`, pas de verre, pas d'ombre portée forte.
- Séparation par filets 1 px (`border-border`, ou `border-slate-900` pour les filets forts des mini-plateformes) plutôt que par cartes.
- Espacement 4 pt ; `space-y-8` entre sections du dashboard ; gouttière mobile `px-4` (mini-plateformes `clamp(20px,4vw,56px)`).
- Cibles tactiles ≥ 44 px (`min-h-11`).

## Mini-plateformes (`/e/*`)

| Page | Disposition |
|---|---|
| Candidats | Titre de l'événement en très grand + colonne méta (slogan en accent, statut, dates) → « Comment voter » en `<dl>` à filets → grille 4:5 (GRID), lignes (LIST) ou bloc large (SPOTLIGHT) |
| Profil | Photo 4:5 à gauche (collante sur desktop), nom en très grand, carte de paiement opaque `data-zone="secure-flow"` |
| Résultats | « Résultats » en très grand ; vainqueur nommé seulement après clôture ; places 2–4 ; « Vote du public » en lignes avec part des voix validées ; aucun montant |

En-tête commun : logo, titre en capitales espacées, onglets soulignés. Pied à fond encre avec le titre en grand. La phase de vote (`lib/vote-phase.ts`) décide si le formulaire de paiement s'affiche.

### Styles de page (`Event.pageStyle`, `data-page-style`)

| Style | Bandeau de la page des candidats | Cartes | Profil et résultats |
|---|---|---|---|
| **Affiche** (défaut) | Couverture importée en plein écran sous un voile encre ; sans couverture, fond encre. Barre : statut, compte à rebours, prix, paiement, bouton. | Photo 4:5, grand numéro dans la police des titres | Fond clair |
| **Soirée** | Fond nuit `#0E1220`, compte à rebours en trois cases, bande « un vote / paiement / quand la voix compte / résultats ». | Nom et numéro sur le bas de la photo | Fond nuit ; la carte de paiement reste claire et opaque |
| **Billet** | Aplat de la couleur de l'événement (version lisible), logo en médaillon ; infos dans un billet blanc à talon détachable. | Dossard encre, barre de voix | En-tête sur l'aplat, fond clair |
| **Couronne** | Composition centrée de gala : logo en médaillon à double anneau, ornement (filets + losange), compte à rebours en cases ; la couverture passe sous un voile clair (option « voile » de la maquette). | Portrait encadré (passe-partout blanc), texte centré | Fond teinté, filets à l'accent |
| **Magazine** | Une de magazine : couverture sur la moitié de l'écran (sinon aplat + logo), dates en sur-titre, titre très grand, slogan en chapeau. | Mosaïque, le premier candidat en grand, nom sur la photo | Fond blanc |
| **Pop** | Aplat vif, contours encre 3 px et ombres franches décalées, titres gras quelle que soit la police. | Carte bordée, ombre franche, numéro sur aplat | En-tête sur l'aplat |
| **Terroir** | Agronomie, foires, gastronomie : couverture dans une arche, infos en pastilles, fond teinté. | Étiquette suspendue, photo en arche | Fond teinté |
| **Stade** | Sport, tournois : fond nuit, couverture en biais, bande diagonale à l'accent, compte à rebours en tableau de score. | Maillot : grand numéro, bandeau du nom à l'accent | Fond clair, titres gras |
| **Line-up** | Concerts, talents : affiche de festival, couverture en bichromie (noir et accent) ; les candidats forment la programmation, en très grand. | Noms en programmation (pas de grille photo) | Fond nuit, comme Soirée |
| **Diplôme** | Écoles, prix : cadre de certificat à double filet, sceau (logo cerclé en pointillé), ornement. | Portrait rond cerclé | Fond teinté |
| **Marché** | Foires agricoles, produits locaux, artisanat : auvent rayé à la couleur de l'événement, prix et compte à rebours sur ardoise, fond kraft. | Cagette photo, étiquette de prix à encoche | Fond kraft teinté |
| **Menu** | Gastronomie, restaurants, cocktails : carte de restaurant à double filet, infos à points de conduite, couverture en assiette ronde. | Liste de plats : nom ……… voix (pas de grille photo) | Fond crème teinté |
| **Wax** | Mode africaine, patrimoine, festivals : demi-écran en motif de pagne (CSS, accent + crème + encre), bande kente. | Photo dans un cadre wax, bande kente sous le nom | Fond crème teinté |
| **Campus** | Écoles, quiz, jeunesse : papier quadrillé sur toute la page, titre surligné, infos sur feuille lignée, couverture en polaroïd. | Polaroïd incliné, pastille de numéro | Papier quadrillé |
| **Badge** | Entreprise, salons, élections : badge de conférence au cordon, infos en grille à filets. | Badge nominatif, voix dans le bandeau du bas | Grille à points |
| **Story** | Médias, créateurs, radio : couverture verticale 9:16 dans un anneau dégradé, couverture floutée en fond. | Carte 9:16 dans un anneau | Fond nuit, comme Soirée |
| **Sanctuaire** | Chorales, foi, récitation : composition centrée, halo de lumière, couverture en arche. | Portrait en arche, double filet | Fond nuit teinté |

Styles à fond nuit (`isNightStyle`, `lib/minisite-style.ts`) : Soirée, Line-up, Story, Sanctuaire. L'action prend l'accent éclairci ; le paiement revient à une carte claire. Les motifs (auvent, wax, quadrillé, halo, anneau) sont des classes `.mini-*` de `globals.css`, dérivées de la couleur de l'événement.

**Fond du haut de page** (`Event.heroBackground`) : `IMAGE` (défaut) pose la couverture derrière le bandeau de tous les styles, sous un voile à la couleur de l'événement (Billet, Pop), nuit (Soirée) ou clair (Couronne, Diplôme) ; `COLOR` garde l'aplat même si une couverture est importée.

**Modèles prêts à l'emploi** (`lib/event-presets.ts`) : seize types d'événement (Miss, mode, concert, talents, sport, e-sport, agronomie, gastronomie, école, awards, culture, gospel, danse, humour, cinéma, pitch), chacun réglant style, police et couleur en un clic.

Le fond des styles clairs est teinté par la couleur de l'événement (`--mini-bg`). Sur l'Affiche avec couverture, les pages profil et résultats gardent une bande de la photo sous l'en-tête.

Toutes les couleurs des pages `/e/*` passent par les jetons `--mini-*` (`globals.css`) : `--mini-bg`, `--mini-ink`, `--mini-muted`, `--mini-line`, `--mini-rule`, `--mini-wash`, `--mini-accent`. En Soirée, l'accent est `--event-accent-bright` (éclairci jusqu'à 4,5:1 sur le fond nuit, `lib/brand.ts`). Le compte à rebours part de la date de fin (ou d'ouverture) stockée ; il disparaît à l'échéance.

## Mouvement

`transform` et `opacity` seulement, 150–300 ms, `prefers-reduced-motion` respecté. Aucune entrée animée au scroll. Seul pulse toléré : la pastille « Ouvert » d'un `StatusChip` live, accompagnée du mot.

## États

Chargement = `LoadingState` ; vide = une phrase + une action ; erreur = `FormError` + réessayer ; succès = une confirmation factuelle. Un écran sans donnée n'invente pas de chiffre : il affiche « — ».

## Langue

Vouvoiement côté organisateur et admin, tutoiement côté votant. Textes dans `lib/i18n.ts` (FR et EN). On dit ce que le produit ne fait pas (pas de virement automatique, vote compté après confirmation). Pas de « simplifiez », « fluide », « en un clic », « premium », « recommandé »…

## Partage

Un seul composant, `ShareSheet` : bouton « Partager » (plein pour l'action principale, bordé sinon) qui ouvre une feuille (en bas sur téléphone, centrée sur ordinateur) : lien copiable, réseaux avec leurs **logos officiels** (tracés Simple Icons CC0, `lib/brand-icons.ts`, couleur de marque), et « Autres applications » (partage natif du téléphone, qui couvre toutes les applications installées). Instagram, TikTok et Snapchat n'ont pas de lien de partage web : partage natif, sinon copie du lien avec « colle-le dans … ». Jamais d'émoji ni de pictogramme générique à la place d'un logo de marque.

## Images

Photos, logos et couverture par import de fichier uniquement (jamais un lien saisi) : réduits dans le navigateur (1 600 px, `lib/image-resize.ts`), puis Cloudinary s'il est configuré, sinon stockés en base par l'API (table `StoredImage`), transformés par `cloudinaryTransform` (`lib/og-image-url.ts`). Sans photo : initiales sur un aplat clair teinté par l'événement. Image de partage : logo ou photo recadré, sinon carte typographique `/e/{slug}/og`.
