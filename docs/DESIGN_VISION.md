# SHADOMA Votes — Design Vision 2026

## Executive Summary

SHADOMA Votes est repositionné comme une **plateforme événementielle premium** pour l'Afrique francophone, combinant l'émotion des concours (Miss Agro, Miss Universe) avec la rigueur UX des SaaS modernes (Linear, Stripe, Vercel).

Chaque événement est un **mini-site sur mesure** dont l'identité visuelle s'adapte automatiquement à la marque de l'organisateur.

---

## Palette par défaut (Platform Brand)

```
Bleu royal profond   #0F172A (neutral-900)
Violet électrique    #6366F1 → #8B5CF6
Or subtil            #F59E0B / #FDE68A
Ardoise premium      #1E293B → #94A3B8
```

**Principe :** Le rose est banni de la palette par défaut. Il n'apparaît que si l'organisateur le choisit.

---

## Architecture du redesign

### Phase 1 — Fondation
- [x] Tokens × globals.css synchronisés
- [ ] Nouvelle palette + variables CSS étendues
- [ ] Utilitaires glassmorphism v2, orbes lumineux, hero gradients
- [ ] Dark mode enrichi

### Phase 2 — Branding événement v2
- [ ] Auto-extraction couleur dominante depuis logo (ColorThief/window)
- [ ] 16 presets organisés par ambiances (Luxe, Nature, Festif, Pro)
- [ ] CSS vars étendues (--event-gradient-*, --event-glow-*, --event-particle-*)
- [ ] Live preview temps réel dans le design editor

### Phase 3 — Landing Page
- [ ] Hero avec scène Three.js plus riche, particules lumineuses
- [ ] Live Voters Feed premium (avril 2026 — avatars avec drapeaux, défilement horizontal fluide, compteurs animés)
- [ ] Sections repensées : Preuve sociale, Stats, Témoignages, Partenaires, CTA final

### Phase 4 — Pages Événement Publiques (Miss Agro 2.0)
- [ ] Hero XXL avec branding dynamique, compte à rebours animé
- [ ] Nav immersive (héroïne, résultats, galerie, partenaires, à propos)
- [ ] Grille candidates premium (masonry, hover 3D, zoom, badges)
- [ ] Profil candidate cinématographique
- [ ] Résultats en direct avec podium 3D animé
- [ ] Sections : L'événement, Galerie, Moments forts, Partenaires

### Phase 5 — Dashboard Organisateur
- [ ] Sidebar moderne avec icônes adaptatives, collapse fluide
- [ ] Event Editor avec preview live + drag & drop
- [ ] Pages de gestion premium (candidats, paiements, stats)

### Phase 6 — Admin God Mode
- [ ] Back-office luxueux, cartes métriques animées, data tables

### Phase 7 — Auth & Error Screens
- [ ] Modales avec illustration, écrans d'erreur premium

---

## Principes d'interaction

| Élément | Animation | Durée |
|---------|-----------|-------|
| Hover carte | 3D lift (translateY -4px, shadow+) | 300ms ease-out |
| Bouton CTA | Glow pulse + scale 1.02 | 200ms |
| Compteur votes | Number滚动 (spring) | 600ms |
| Page transition | Fade + slide 8px | 350ms |
| Podium entrée | Stagger bottom→up | 100ms/item |
| Confettis gagnants | Canvas burst | 2s |
| Scroll reveal | Opacity + translateY 22px | 620ms ease |

---

## Règles strictes

1. **Zéro rose par défaut** — sauf si l'organisateur choisit une palette rose
2. **Zéro fausse data** — tout composant a ses états loading/empty/error
3. **Responsive mobile d'abord** — tout élément testé à 375px
4. **WCAG AA** — contraste ≥ 4.5:1, focus visible, aria-labels
5. **Personnalisation = priorité #1** — chaque écran événement doit pouvoir changer de couleur via CSS vars
