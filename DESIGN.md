# DESIGN.md — SHADOMA

Source de vérité du design. Les tokens vivent dans `apps/web/app/globals.css` (`@theme`) ; ce fichier dit comment s'en servir. Tout nouvel écran suit ces règles ; un écart se justifie ici, pas dans le code.

## Principes

1. **Encaissement d'abord.** Sur chaque écran, on sait en cinq secondes qui paie qui, combien, et ce qui n'est pas encore compté.
2. **Une seule structure, plusieurs couleurs.** Les mini-plateformes ne varient que par le titre, le logo et la couleur de l'événement. La structure est commune (maquette `3 · Résultats-html.zip`).
3. **Composants existants seulement.** `Button`, `Card`, `Input`, `Select`, `StatusChip`, `FormError`, `LoadingState`, `ConfirmDialog`, `PublicEventShell`, `CandidatePhoto`… On adapte, on ne recrée pas.
4. **Rien d'inventé.** Pas de chiffre, de témoignage, de logo ou d'opérateur qui ne vienne pas des données.

## Matières

| Rôle | Token | Valeur | Usage |
|---|---|---|---|
| Encre | `slate-900` | `#0F172A` | titres, texte principal, filets forts |
| Encre secondaire | `slate-600` | `#475569` | texte d'appui (jamais plus clair pour un texte utile) |
| Action | `brand-600` / `--color-primary` | `#4F46E5` | bouton principal, lien |
| Repère admin | `gold-600` / `gold-700` | `#D97706` | liseré admin, médaille du 1er — jamais sur un bouton d'argent |
| Succès / erreur / info / alerte | `--color-*-text` | `#047857` / `#DC2626` / `#1D4ED8` / `#B45309` | texte d'état, toujours ≥ 4,5:1 |

Dans une mini-plateforme, `--color-primary` = `--event-accent-strong` (moteur `lib/brand.ts`, ≥ 4,5:1 garanti). La couleur brute de l'événement (`--event-accent`) ne sert qu'aux aplats sans texte (barres, filet sous l'onglet actif).

## Typographie

- **Plus Jakarta Sans** (`font-display`) : titres. **Inter** (`font-body`) : texte. **JetBrains Mono** : références de transaction.
- Titres en romain, jamais d'italique. Un H1 par page.
- Mini-plateformes : titres `font-light uppercase tracking-[0.04em]` en grand (`clamp`), sur-titres `text-[11px] uppercase tracking-[0.24em]`, navigation `text-[11px] uppercase tracking-[0.22em]`.
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

En-tête commun : titre en capitales espacées, onglets soulignés par l'accent. Pied à fond encre avec le titre en grand. La phase de vote (`lib/vote-phase.ts`) décide si le formulaire de paiement s'affiche.

## Mouvement

`transform` et `opacity` seulement, 150–300 ms, `prefers-reduced-motion` respecté. Aucune entrée animée au scroll. Seul pulse toléré : la pastille « Ouvert » d'un `StatusChip` live, accompagnée du mot.

## États

Chargement = `LoadingState` ; vide = une phrase + une action ; erreur = `FormError` + réessayer ; succès = une confirmation factuelle. Un écran sans donnée n'invente pas de chiffre : il affiche « — ».

## Langue

Vouvoiement côté organisateur et admin, tutoiement côté votant. Textes dans `lib/i18n.ts` (FR et EN). On dit ce que le produit ne fait pas (pas de virement automatique, vote compté après confirmation). Pas de « simplifiez », « fluide », « en un clic », « premium », « recommandé »…

## Images

Photos et logos par import de fichier (Cloudinary) uniquement, transformés par `cloudinaryTransform` (`lib/og-image-url.ts`). Sans photo : initiales sur un aplat clair teinté par l'événement. Image de partage : logo ou photo recadré, sinon carte typographique `/e/{slug}/og`.
