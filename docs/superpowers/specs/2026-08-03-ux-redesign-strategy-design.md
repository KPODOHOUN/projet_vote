# Stratégie de redesign UX/UI — SHADOMA Votes (hors Home)

**Date :** 2026-08-03
**Statut :** En attente de validation (3 décisions ouvertes, §8)
**Périmètre :** toutes les pages **sauf** `app/page.tsx` (Home inchangée pour l'instant)
**Méthode :** Phase 0 — exploration (3 agents + lectures directes), compréhension produit, recherche 2026, audit classé, puis cette stratégie. Aucune ligne de code modifiée.

---

## 1. Compréhension du produit

### 1.1 Problème résolu
SHADOMA Votes est un SaaS multi-tenant qui permet à un organisateur (association, concours de miss, campus, réseau) de lancer un **concours à votes payants**, d'**encaisser chaque vote en Mobile Money (XOF)**, de suivre le classement en direct et de **récupérer ses revenus** — sans déployer sa propre stack. Marché : Bénin + Afrique francophone de l'Ouest (FeexPay, FedaPay, KkiaPay ; MTN/Moov/Orange).

### 1.2 Utilisateurs et objectifs
| Rôle | Qui | Objectif #1 | Écrans critiques |
|------|-----|-------------|------------------|
| **Votant** (anonyme, ~95 % du trafic, majoritairement mobile) | Public | Voter pour son candidat en < 2 min, payer en MoMo, voir le classement | `/e/[slug]`, `/e/[slug]/c/[ref]`, `/e/[slug]/results` |
| **ORGANIZER_OWNER** | Organisateur | Créer → activer → suivre → encaisser (wallet → retrait) | `/dashboard/*`, `/dashboard/events/[id]/*`, `/dashboard/wallet` |
| **ORGANIZER_STAFF** | Équipe orga | Opérer sans réglages sensibles | idem, actions OWNER masquées |
| **PLATFORM_ADMIN / SUPER_ADMIN** | Opérateurs | Valider retraits, configurer offres, superviser | `/admin/offers/*`, `/admin/users`, `/admin/audit` |

### 1.3 Tâches les plus fréquentes (par ordre d'impact)
1. **Voter** (funnel revenu) : page event → candidat → quantité → téléphone → push MoMo → confirmation. *Déjà le parcours le plus soigné du code.*
2. **Créer/activer un concours** : quick-start → candidats → activation → partage du lien.
3. **Suivre l'argent** : wallet pending/available → clôture → retrait.
4. **Admin : valider un retrait** (workflow Escrow, seul parcours actif en phase test).

### 1.4 État produit
Phase **test/démo** : offre **ESCROW seule active** (`offer1_external_enabled=false`), paiements démo, legacy **Plans/Partenaire** encore présent en base et partiellement en UI (redirections `/admin/plans` → `/admin/offers`). Le redesign doit clarifier le messaging Escrow-only et masquer proprement le legacy — pas le ré-expliquer.

### 1.5 Frictions principales (constatées, avant audit visuel)
- Cold start API (30–60 s sur hébergeur gratuit) → les états de chargement doivent être excellents, c'est une contrainte produit réelle.
- Cohérence de navigation : pages admin orphelines, nav dashboard incomplète (Subscription/Start absents, onglet tickets absent de l'event shell).
- Modèle économique en transition visible dans l'UI (bannières subscription, pages legacy).
- 3 systèmes d'i18n mélangés (`t()`, ternaires `isEn`, `publicEventMessage`).

---

## 2. Recherche 2026 — principes extraits (pas copiés)

Sources : Nielsen Norman Group (progressive disclosure), guides dashboard 2026 (Aufait UX, DesignPixil), SaaSFrame (211 pricing pages), docs PSP mobile money (Afriex, Korapay, LigdiCash, M-Pesa Daraja), et patterns observés Linear / Stripe / Vercel / Notion / Raycast.

**Dashboards — decision-first :** 3 couches (statut → KPI → contexte), 3–5 KPI max en vue principale, détail en drill-down, règle des 5 secondes, vues par défaut selon le rôle, < 1,5–2,5 s perçu.
**Pricing / conversion :** 3 tiers max, tier recommandé mis en avant, 5–7 features par carte, FAQ 5–8 objections, preuve sociale près du CTA, sticky CTA mobile (+8–15 %).
**Mobile money :** push système (STK) > OTP manuel ; état d'attente **honnête** (« validez sur votre téléphone ») ; confirmation serveur seule (webhook + polling fallback) ; retry **sans ressaisie**.
**Produit-manipulation-d'argent :** la confiance est la métrique UX #1 (Stripe) — surfaces calmes dans les zones de paiement, branding festif cantonné aux zones marketing/événement.
**Design systems 2026 :** tokens uniques, un seul composant par concept, états (loading/empty/error/success) traités comme des variants du composant, pas du code ad-hoc.

---

## 3. Audit UX/UI — classé par sévérité

Échelle : **P0** cassé/bloquant · **P1** majeur (friction quotidienne ou incohérence systémique) · **P2** moyen · **P3** cosmétique/dette.

### P0 — Cassé ou bloquant
| # | Problème | Preuve | Impact |
|---|----------|--------|--------|
| P0-1 | Token conteneur inexistant : les layouts utilisent `max-w-container-max`, jamais défini dans `@theme` (seuls `--max-width-container`, `-wide`, `-narrow` existent) → classe noop | `app/dashboard/layout.tsx`, `app/admin/layout.tsx` vs `globals.css` | Largeur de contenu non maîtrisée sur **toutes** les pages dashboard/admin |
| P0-2 | Pages admin orphelines : `subscriptions`, `partners`, `display-partners`, `account-partners` live mais absentes de la sidebar ; `plans`/`payments` = redirects | `components/admin-sidebar.tsx`, `app/admin/*` | IA cassée : l'admin découvre des écrans par hasard ; modèle legacy visible |
| P0-3 | Nav dashboard désynchronisée : Wallet/Offer présents, **Subscription/Start absents** alors que des bannières pointent vers `/dashboard/subscription` ; onglet **tickets** absent de l'event shell | `dashboard-sidebar.tsx`, `event-dashboard-shell.tsx` | L'organisateur ne trouve pas la billetterie ni son abonnement |
| P0-4 | `globals.css` est **partagé avec la Home (exclue)** : toute refonte des tokens/classes `.vp-*` peut casser la Home | `app/layout.tsx` import | Contrainte structurante : voir stratégie §5.8 (compat Home) |

### P1 — Majeur / systémique
| # | Problème | Impact |
|---|----------|--------|
| P1-1 | **React Query installé + provider actif, zéro `useQuery`** : chaque page réinvente loading/error/empty en `useState`/`useEffect` | États incohérents partout ; pas de cache ; cold start ressenti à chaque navigation |
| P1-2 | **3 systèmes d'i18n** (`t()`, ternaires `isEn ?`, `publicEventMessage`) parfois dans le même composant | Maintenance fragile, strings intraduisibles |
| P1-3 | **3 systèmes de cartes** (`GlassCard`/`.vp-glass`, shadcn `Card`, `rounded-2xl border bg-card` ad-hoc) + **2 APIs Button** (`variant="primary"` adapté vs `variant="default"` shadcn) | Aucune surface ne se ressemble tout à fait |
| P1-4 | **Couleurs de statut ad-hoc** (`emerald-*`, `amber-*`, `sky-*` Tailwind bruts) au lieu des tokens `--color-success/warning/info` | Incohérence sémantique, dark mode impossible à raisonner |
| P1-5 | **Erreurs de formulaire divergentes** : `FormError` vs boîtes `bg-destructive/10` réécrites ~10 fois | États d'erreur inégaux, a11y variable |
| P1-6 | **3 langages de header** : marketing = glass sombre flottant, dashboard = `vp-header-glass`, admin = carte gold | 3 marques visuelles pour 1 produit |
| P1-7 | **Dark mode mort** : bloc `[data-theme="dark"]` + classes `dark:` + `next-themes` en deps, **aucun ThemeProvider**, README DS dit « thème clair unique » | Code mort ambigu — décision requise (§8, D1) |
| P1-8 | **Auth fragmentée** : login/register = modale sur Home ; OTP/reset = pages `AuthSimpleLayout` ; callback OAuth = page nue ; `AuthSplitLayout` + `AuthMarketingAside` orphelins | Parcours d'entrée décousu au moment où la confiance se construit |
| P1-9 | **Loading UX hétérogène** : `LoadingState` structuré vs texte « Chargement… » vs splash vs `Suspense fallback={null}` | Pendant le cold start 30–60 s, certaines pages sont **blanches** |
| P1-10 | Tables admin **desktop-first** (multi-colonnes, overflow-x) ; ticket designer lourd sur petit écran | Admin inutilisable au téléphone |

### P2 — Moyen
| # | Problème | Impact |
|---|----------|--------|
| P2-1 | Échelles floues : `rounded-md/xl/2xl/3xl/full` mélangés ; paddings admin `p-8/12/16` vs dashboard `p-6/10/12` ; `max-w-3xl/6xl/md` imbriqués dans un layout déjà cappé | Rythme visuel instable |
| P2-2 | Breakpoint custom `min-[721px]` (app-header) vs `lg` partout ailleurs | Comportements imprévisibles entre 721 et 1024 px |
| P2-3 | Dashboard home peu **decision-first** : KPI « Dernier événement » (nom, pas une métrique), pas de revenus/votes du jour ; onboarding checklist utile mais lourde | La page la plus vue par l'orga n'aide pas à décider |
| P2-4 | Sélecteur opérateur MoMo = `<select>` **natif** dans le funnel vote (sinon très soigné : presets, attente honnête, retry sans ressaisie) | Faux pas visuel au moment du paiement |
| P2-5 | Touch targets inégaux (CTA `h-9` vs `min-h-11` ailleurs) ; focus rings pas systématiques sur éléments custom | A11y mobile / clavier |
| P2-6 | GSAP (+ presets) en deps, **inutilisé** dans `apps/web` ; three/R3F = Home only mais dans le bundle commun | Poids mort, confusion de stack d'animation |

### P3 — Cosmétique / dette
- P3-1 Docs obsolètes : `design-system/README.md` (palette cream, brand #2E5BFF, « pas de data-theme »), `USER_JOURNEY.md` (`/vote/{tenant}`).
- P3-2 Code mort : layouts auth orphelins, `i.pravatar.cc` dans les remote patterns.
- P3-3 Nommage produit : `@votezpro/web` vs marque « SHADOMA Votes ».

---

## 4. Ce qui est déjà bon (à conserver tel quel)
1. **Funnel vote** (`CandidateVoteClient`) : presets quantité chiffrés, total clair, attente honnête, `aria-live`, retry sans ressaisie, référence transaction.
2. **Pages publiques RSC + SEO** (`/e/*`) : SSR, `generateMetadata` OG par événement/candidat.
3. **Design tokens 2026** : palette indigo/violet/gold cohérente, fonts self-hostées variable, glassmorphism maîtrisé, `prefers-reduced-motion` respecté sur orbs/reveal.
4. **Sidebar dashboard/admin** : collapse, drawer mobile + overlay, `aria-current`, focus rings.
5. **Backend sain pour l'UI** : contrats d'erreur uniformes (`code`, `traceId`), SSE + polling statut paiement, feature flags, maintenance status.

---

## 5. Stratégie de redesign

### 5.1 Philosophie
> **« La confiance d'abord, l'éclat ensuite. »** Le produit manipule de l'argent réel (votes payants, escrow, retraits) pour des utilisateurs souvent sur mobile et réseau fragile. Chaque écran doit répondre en 5 secondes à : *où suis-je, que se passe-t-il, que dois-je faire ?* Le premium visuel (glass, glow, motion) est conservé mais **discipliné** : il sert la hiérarchie, jamais il ne la concurrence. Une tâche primaire par écran.

### 5.2 Principes UX
1. **Decision-first** : chaque dashboard montre d'abord statut → 3–5 KPI actionnables → contexte ; le détail vit en drill-down.
2. **Progressive disclosure** : masquer la complexité (comparaisons, filtres avancés, legacy) derrière une action explicite.
3. **Honest waiting** : tout état async est explicite (cold start, push MoMo) avec explication + issue ; jamais d'écran blanc.
4. **Vues par rôle** : STAFF ne voit jamais une action OWNER désactivée — elle est absente ; votant = zéro chrome plateforme.
5. **Zéro impasse** : chaque empty state a un CTA réel ; chaque erreur propose la récupération.
6. **Mobile votant d'abord** : le funnel vote est conçu pour 360 px puis adapté au desktop — pas l'inverse.

### 5.3 Principes visuels
1. **Une surface, quatre tons** : un seul système de cartes/tokens, décliné en 4 zones identifiables —
   - **Publique événement** (`/e/*`) : immersive, branding événement (`data-event-theme`), festif.
   - **Zone sécurisée** (paiement, auth, OTP) : plateforme neutre et calme (`data-zone="secure-flow"` — pattern existant à généraliser), aucune couleur événement.
   - **Dashboard orga** : productivité calme type Linear — fonds unis, glass uniquement en chrome (header/sidebar), jamais sur le contenu de travail.
   - **Admin** : dense et sobre, accent gold réservé aux marqueurs de zone (sidebar, bannière) — pas aux actions.
2. **Couleur = sémantique** : statuts uniquement via tokens `success/warning/error/info` ; suppression des `emerald/amber/sky` ad-hoc.
3. **Rayons unifiés** : `sm 8 / md 12 / lg 16 / xl 24` (+ `full`) ; fini les `2xl/3xl` aléatoires.
4. **Motion** : framer-motion + CSS keyframes ; micro-interactions < 300 ms ; `prefers-reduced-motion` partout ; **GSAP retiré des deps web** (inutilisé), three/R3F reste cantonné Home.
5. **Typographie** : Jakarta display pour titres/chiffres clés, Inter pour le corps, tabular-nums pour toute donnée financière.

### 5.4 Principes de navigation
- **Dashboard orga (IA corrigée)** : Overview · Événements · Billetterie · Recherche → déplacée dans le header (command bar, pattern Linear/⌘K) · Portefeuille · Mon offre · Équipe · Notifications · Compte. Event shell : onglets Vue d'ensemble / Candidats / **Billetterie** / Design / Réglages.
- **Admin (IA complétée)** : sections *Offres & argent* (offres, events, retraits, payouts, subscriptions) · *Utilisateurs* (users, partenaires legacy regroupés sous un menu « Hérité ») · *Plateforme* (feature flags, maintenance, audit, jobs, settings). Plus aucune page orpheline.
- **Breadcrumb systématique** dans l'espace événement et admin profond.
- **Un seul header pattern** par zone (fini les 3 langages), breakpoint unique `lg` (suppression du 721 px custom).

### 5.5 Stratégie composants
1. **Un seul `Button`** (API shadcn `default/destructive/outline/secondary/ghost/link` + `loading`) ; l'adaptateur `primitives.tsx` est déprécié puis retiré (migration mécanique `primary` → `default`).
2. **Un seul `Card`** : shadcn + variant `glass` ; `GlassCard` et les cartes ad-hoc migrent.
3. **Un seul `StatusChip`** sur tokens sémantiques (remplace Badge-as-status et pills custom).
4. **États standardisés** : `LoadingState`, `EmptyState` (icône + titre + CTA réel), `FormError` — obligatoires, plus aucune boîte custom.
5. **Adoption React Query** : hooks par domaine (`useEvents`, `useWallet`, `useWithdrawals`…) → cache partagé, états uniformes, refetch propre ; corrige P1-1 et P1-9 d'un coup.
6. **Formulaires** : conserver controlled + `validate()` (pas de migration react-hook-form — pas justifiée), mais champ standard `FormField` (label + input + erreur + hint) et `Select` design-system pour remplacer les `<select>` natifs.
7. **Tables** : `DataTable` avec vue cartes automatique < `md` (corrige P1-10).

### 5.6 Accessibilité (WCAG 2.2 AA)
Contrastes ≥ 4,5:1 (vérifier `gold-700` sur blanc et `brand-500` en dark) ; touch targets ≥ 44 px partout ; focus visible systématique ; `aria-live` sur tous les flux d'attente (paiement, OTP) ; tables avec en-têtes ; skip-link conservé ; vérification clavier complète par page à chaque refonte.

### 5.7 Responsive
Mobile-first votant (360 px) ; dashboard = desktop-first avec repli tablette propre ; admin = desktop assumé mais listes en cartes < `md` ; un seul système de breakpoints Tailwind par défaut ; tests systématiques 360 / 768 / 1280 / 1440.

### 5.8 Design system & compatibilité Home (contrainte P0-4)
La Home partage `globals.css`. Règle stricte : **on ajoute, on ne casse pas** —
- Interdit de renommer/supprimer une classe ou variable utilisée par la Home (`vp-glass*`, orbs, gradients body, palettes).
- Autorisé : ajouter des tokens (conteneurs manquants, radius, sémantiques), corriger des valeurs **sans effet visuel sur la Home**, déprécier par duplication (`@deprecated` en commentaire + nouvelle classe).
- Le travail de fondation (tokens, primitives React) n'a aucun impact visuel Home. La refonte des pages non-Home n'altère pas la Home. Quand la Home sera à son tour redesignée, les classes dépréciées seront retirées.

### 5.9 Priorités d'implémentation
| Phase | Contenu | Pourquoi cet ordre |
|-------|---------|--------------------|
| **A — Fondations** | Tokens (conteneur P0-1, radius, sémantiques), unification Button/Card/StatusChip/états, React Query hooks, retrait GSAP, i18n unifié | Tout le reste en dépend ; zéro changement visuel visible → risque minimal |
| **B — Zone votante publique** (`/e/*`, vote candidat, résultats, tickets publics) | Refonte mobile-first, `Select` DS dans le funnel, surfaces de confiance | C'est le revenu ; 95 % du trafic ; petit périmètre (4 pages) |
| **C — Auth** (modale, OTP, reset, OAuth, invitation) | Un seul template auth, suppression layouts orphelins | Confiance à l'entrée ; périmètre moyen |
| **D — Dashboard orga** (16 pages) | IA corrigée (P0-3), home decision-first (P2-3), event shell + tickets, wallet/offre Escrow lisibles | Rétention orga ; plus gros morceau |
| **E — Admin** (14 pages) | IA complétée (P0-2), DataTable responsive, regroupement legacy | Outil interne : critique mais tolère d'arriver après l'expérience client |
| **F — Polish** | Perf (budget glass mobile), audit a11y final, purge code mort restant | Après stabilisation |

### 5.10 Risques
| Risque | Mitigation |
|--------|-----------|
| Casser le funnel vote (revenu) | Phase B en dernier des parcours publics ; tests e2e Playwright existants + nouveaux avant/après ; aucun changement de contrat API |
| Casser la Home (exclue) via `globals.css` | Règle §5.8 ; revue visuelle Home à chaque PR de fondation |
| Scope creep (refactor backend, i18n complet, RBAC) | Redesign UI uniquement ; aucun endpoint modifié ; dette notée, pas traitée ici |
| Régressions silencieuses (pages peu testées) | Checklist états (loading/empty/error/success) par page ; typecheck + lint + e2e ciblés par phase |
| Dark mode à moitié fait | Décision D1 prise **avant** la Phase A |

### 5.11 Impact attendu
- **Conversion vote** : funnel déjà bon → viser +10–15 % via confiance mobile (sticky CTA, select DS, zéro friction opérateur).
- **Activation orga** : home decision-first + IA corrigée → time-to-first-event réduit.
- **Support** : moins de « où est X ? » (nav, empty states, erreurs récupérables).
- **Vélocité dev** : un seul système de composants → les prochaines features coûtent moins cher.

---

## 6. Processus par page (rappel du cadre imposé)
Pour chaque page/zone : **Analyser → Expliquer le WHY → Proposer → Validation si requise → Implémenter → Review → Raffiner** jusqu'à qualité production. Jamais plus d'une feature majeure à la fois. Si une solution existante est optimale, elle est conservée (ex. : structure RSC de `/e/*`, funnel vote dans ses grandes lignes).

## 7. Hors périmètre explicite
Home (`app/page.tsx`) ; backend/endpoints ; contenus marketing des pages légales ; migration i18n complète (on unifie le **pattern** au fil des pages touchées, pas en big bang) ; billetterie designer (outil lourd — traité en Phase D comme page, pas réécrit).

## 8. Décisions actées (validation utilisateur du 2026-08-03)
- **D1 — Dark mode : light-only, retrait progressif.** Constat affiné pendant la planification : supprimer `@custom-variant dark` de `globals.css` ferait repasser les classes `dark:` restantes en mode media-query OS (défaut Tailwind v4) → changement visuel potentiel sur des fichiers hors périmètre. Règle actée : le mécanisme dark (`@custom-variant` + bloc `[data-theme="dark"]`) reste **inerte** jusqu'à la refonte de la Home ; les classes `dark:` sont retirées de chaque fichier au moment où celui-ci est refondu (Phase A pour les primitives `components/ui/*`, puis au fil des zones) ; `next-themes` est retiré (seul consommateur : `sonner.tsx`, qui passe en `theme="light"` fixe). Retrait complet du mécanisme = lors de la refonte Home.
- **D2 — Direction visuelle : immersif généralisé (choix utilisateur).** Glass et motion sur **toutes** les zones, dashboard et admin compris. Application avec garde-fous non négociables (§5.3 bis).
- **D3 — Première zone après fondations : publique votante `/e/*`.** Confirmé : revenu, 95 % du trafic, mobile d'abord, petit périmètre (4 pages).

### 5.3 bis — Garde-fous de l'immersif généralisé (conséquence de D2)
L'immersif est la direction ; la lisibilité et la performance restent la loi :
1. **Intensité graduée** : chrome (sidebar, header, modales) = glass fort (`vp-glass-strong`) ; contenu de travail = glass subtil (`vp-glass-subtle`) ; zones de paiement/OTP = surface quasi opaque (lisibilité maximale, confiance).
2. **Perf mobile** (marché : téléphones entrée/milieu de gamme) : nombre de surfaces `backdrop-filter` simultanées limité (~8 max visibles) ; blur réduit sous `md` via media query ; `will-change` interdit en permanence ; test sur device réel avant fin de chaque phase.
3. **Motion** : présente partout mais < 300 ms, jamais au moment d'un submit critique (paiement, retrait), `prefers-reduced-motion` respecté sans exception.
4. **Densité préservée** : le glass ne gonfle pas les espacements — l'admin reste dense, le dashboard reste scannable (règle des 5 secondes toujours applicable).
