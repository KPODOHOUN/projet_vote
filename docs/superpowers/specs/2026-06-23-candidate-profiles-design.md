# Spec — Profils candidats & partage par candidat

**Date :** 2026-06-23
**Branche :** `feat/multi-psp-payouts`
**Statut :** design validé (brainstorming), à transformer en plan d'implémentation.

## Problème / intention

Aujourd'hui le lien partagé d'un concours mène sur `/e/{slug}`, une page qui liste les
candidats dans un `<select>`/grille et porte directement le formulaire de vote. Les
candidats n'ont **ni photo ni compteur de votes visible**.

L'organisateur veut **partager le lien d'UN candidat précis** : la personne qui clique
doit tomber **directement sur le profil de ce candidat** (grande photo + nom + nombre de
votes) et pouvoir voter **sur cette même page**, pour ce candidat.

## Décisions verrouillées (brainstorming)

1. **Photo** : champ `photoUrl` = URL collée en **Phase 1** (cohérent avec le `logoUrl`
   existant, `z.string().url()`, zéro nouvelle infra). L'**upload de fichier est une
   Phase 2** ultérieure qui alimentera le même champ ; hors périmètre de cette spec.
2. **Structure** : `/e/{slug}` = **hub annuaire** (grille de cartes candidats → liens) ;
   `/e/{slug}/c/{number}` = **page profil + cible du lien partagé** + formulaire de vote.
3. **Photo obligatoire** : requise dans le formulaire de création/édition de candidat
   (validation) ; **fallback initiales** (sur fond `--vp-accent`) pour les candidats
   existants sans photo (initiales sur **fond accent-teinté clair**, texte ink — jamais
   sur l'accent brut), afin de ne jamais casser l'UI. Migration `photoUrl` **nullable**.
4. **Compteurs de votes** : affichés sur le hub et le profil. Cohérent avec la page
   `/e/{slug}/results` déjà publique. Tally **PAID-only** (réutilise la logique
   `computeResults` : un vote ne compte qu'une fois son paiement VOTE confirmé).
5. **Hub = annuaire pur** : aucun vote sur le hub ; **un seul chemin de vote** = le profil.
6. **Vote verrouillé** sur le candidat de la page profil (pas de sélecteur de candidat).

## Architecture

### Backend (NestJS + Prisma)

**B1 — Migration.** Ajouter `Candidate.photoUrl String?` (nullable). Pas de backfill.

**B2 — Création/édition candidat** (`events.service.ts`). Étendre `createCandidateSchema`
(et le schéma d'édition s'il existe) avec `photoUrl: z.string().url().max(500)`.
- À la **création** : `photoUrl` **requis** (non-optionnel) — applique la règle « photo
  obligatoire à la création ».
- À l'**édition** : `photoUrl` optionnel (mise à jour possible).
- Persister `photoUrl` dans le `candidate.create`/`update`. Pas de changement d'audit.

**B3 — Endpoint public étendu** : `GET /votes/public/event/:eventSlug`
(`getPublicEventBySlug`). Ajouter à chaque candidat : `photoUrl` (select) + `voteCount`
(tally PAID-only). Factoriser le calcul par-candidat depuis `computeResults` (ou un helper
partagé `tallyPaidByCandidate(eventId)`) pour éviter la duplication. Le hub obtient tout
en un seul appel.

**B4 — Nouvel endpoint public** : `GET /votes/public/event/:eventSlug/candidate/:number`.
Retourne `{ organizer, event (mêmes champs+branding que B3), candidate: { id, fullName,
number, photoUrl, voteCount } }`. 404 si event ou candidat introuvable. Sert le SSR du
profil + le `generateMetadata` OG. `cache: no-store` (compteur live).

### Frontend (Next.js App Router)

**F1 — Hub `/e/{slug}` (annuaire).** La grille existante (`vp-candidate-grid`) devient une
grille de **liens** : chaque carte = `Link` vers `/e/{slug}/c/{number}`, affichant
**photo** (ou placeholder initiales), **nom**, **badge n°**, **compteur de votes**. Plus
de `<form>`, plus de `EventVoteClient` sur cette page. Conserver l'accent par-événement
(`--vp-accent`), le header (organizer pill, titre, statut, lien résultats), et
l'empty-state si 0 candidat. Si event non ACTIVE : message « vote non ouvert » (déjà
présent) + accès résultats.

**F2 — Profil `/e/{slug}/c/{number}`.** Nouveau dossier de route
`app/e/[slug]/c/[number]/`.
- `page.tsx` (server) : fetch B4 (SSR, no-store) → 404 via `notFound()` si absent.
  `generateMetadata` : titre `{candidat} · {event}`, **OG image = candidate.photoUrl**
  (sinon logo event), description orientée « Votez pour {nom} au concours {event} ».
- Layout : grande **photo** (ratio carré/portrait, `aspect-ratio`, fallback initiales),
  **nom**, **badge n°**, **compteur de votes** (snapshot SSR), lien retour vers le hub,
  lien résultats.
- `CandidateVoteClient.tsx` (client) : **réutilise** le flux de paiement éprouvé
  (consent → cast → init → SSE + fallback polling) **et le suivi paiement humanisé**
  (`.vp-vote-status`) déjà livrés dans l'actuel `EventVoteClient`, mais **verrouillé** sur
  ce candidat : pas de sélecteur, `candidateNumber` fixé en prop. Le formulaire ne garde
  que montant (ou prix fixe), téléphone, consentement, CTA « Voter · {montant} XOF ».
  Après confirmation SUCCEEDED : ré-incrémenter le compteur affiché (optimiste).

**F3 — Refactor d'`EventVoteClient`.** Le flux de paiement + UI statut sont aujourd'hui
dans `EventVoteClient`. Extraire la partie **paiement/suivi** réutilisable pour que le
profil (`CandidateVoteClient`) la partage sans dupliquer la logique SSE/polling.
`EventVoteClient` actuel disparaît du hub (F1). Option d'implémentation : un hook partagé
`usePublicVotePayment({ organizerSlug, eventSlug })` exposant `submit(candidateNumber,
amount, phone)` + `status`, consommé par `CandidateVoteClient`.

**F4 — Placeholder photo.** Composant/markup commun : si `photoUrl` absent ou invalide,
afficher les **initiales** du `fullName` en texte **ink** sur un **fond accent-teinté
clair** (`color-mix(in srgb, var(--vp-accent) ~14%, var(--vp-paper))`) — jamais ink sur
l'accent brut, afin de garantir le contraste quelle que soit la couleur organisateur.
Réutilisé sur le hub (petit) et le profil (grand).

**F5 — Dashboard organisateur — formulaire candidat.** Page
`app/dashboard/events/[eventId]/candidates/` : ajouter un champ **Photo (URL)** au
formulaire de création (requis) et d'édition (optionnel), avec aperçu de la vignette.
i18n fr+en.

## Composants / unités (responsabilité unique)

| Unité | Rôle | Dépend de |
|---|---|---|
| `tallyPaidByCandidate(eventId)` (API) | Map candidatId → voteCount PAID | Prisma |
| `GET …/event/:slug` (étendu) | hub data (candidats + photo + votes) | tally |
| `GET …/event/:slug/candidate/:number` | profil data (1 candidat) | tally |
| Hub `page.tsx` | annuaire de liens | endpoint étendu |
| Profil `page.tsx` + metadata | SSR + OG par candidat | endpoint candidat |
| `usePublicVotePayment` | flux consent→cast→init→SSE/polling | api client |
| `CandidateVoteClient` | form verrouillé + suivi | hook paiement |
| `CandidatePhoto` (placeholder) | photo ou initiales | — |

## Gestion d'erreurs

- Endpoint candidat 404 → `notFound()` (page 404 Next).
- `photoUrl` invalide/cassée côté client : fallback initiales (gérer `onError` de l'image).
- Vote : réutilise la gestion existante (erreur affichée, suivi paiement, échec + réessayer).
- `photoUrl` validé hex/URL côté backend (zod url) ; côté affichage OG, n'émettre l'image
  que si URL présente.

## Tests

- **Backend (vraie DB)** : migration appliquée (dev+test) ; création candidat exige
  `photoUrl` ; endpoint étendu renvoie `photoUrl`+`voteCount` (PAID-only prouvé : un vote
  non payé ne compte pas) ; endpoint candidat renvoie le bon candidat + 404 sinon ;
  isolation event (un `number` d'un autre event n'est pas résolu).
- **Frontend e2e (Playwright)** : lien partagé `/e/{slug}/c/{number}` affiche le bon
  candidat (nom + compteur) ; vote verrouillé déclenche le flux ; hub liste les cartes et
  un clic mène au profil. (Respecter [[e2e-run-gotchas]] : `E2E_API_BASE_URL=:3011`.)

## Hors périmètre (YAGNI)

- Upload de fichier (Phase 2).
- Édition/recadrage d'image, CDN, optimisation `next/image` distante (URLs externes).
- Masquage conditionnel des compteurs (les résultats sont déjà publics).
- Partage natif / génération d'image OG dynamique au-delà de la photo fournie.

## Références

Voir [[vote-flow-elevation]] (suivi paiement humanisé + accent réutilisés),
[[event-as-platform-pivot]] (ADR-016, event = unité publique),
[[design-system-two-layers]] (rester en `vp-*` côté public).
