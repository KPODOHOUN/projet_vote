# Spec — Recherche globale (full-stack)

**Date:** 2026-06-21
**Sous-projet #3** du programme (Invitations ✅ → Compte ✅ → **Recherche** → Notifications → Design).
**Périmètre:** Backend (module `search` + tests vraie DB) puis frontend (palette header + page résultats).

## Contexte & objectif

Donner à un membre connecté une recherche globale sur les données de **son organisation** : événements, candidats, membres, paiements. Recâble le champ de recherche du header (retiré lors de la finalisation design car non fonctionnel) sur un vrai endpoint.

Aucun endpoint de recherche n'existe. Les entités sont scopées par `tenantId` (events/users/payments en colonne directe ; candidates via `event.tenantId`). Le téléphone votant est hashé (non cherchable).

**Décisions de cadrage validées :**
- 4 entités : Événements, Candidats, Membres, Paiements.
- Recherche scopée au tenant de l'utilisateur (pas de cross-tenant ; le cross-tenant platform-admin sera un ajout ultérieur).
- Moteur : Prisma `contains` + `mode: "insensitive"` (ILIKE), pas de full-text/migration (MVP).
- UX : palette typeahead dans le header **+** page de résultats `/dashboard/search`.
- Gating rôle : events + candidats pour tout membre ; **membres + paiements pour tout rôle SAUF `ORGANIZER_STAFF`**.

## Contrats backend existants (vérifiés)

- `UserRole` : `PLATFORM_SUPER_ADMIN | PLATFORM_ADMIN | ORGANIZER_OWNER | ORGANIZER_STAFF`.
- `Event` : `{ id, tenantId, slug (unique global), title, status }`. `EventStatus`.
- `Candidate` : `{ id, eventId, fullName, number }` (pas de tenantId — scoper via `event.tenantId`).
- `User` : `{ id, tenantId, email, role }`. `@@unique([tenantId, email])`.
- `PaymentTransaction` : `{ id, tenantId, eventId, provider, providerRef?, amountCfa, status, createdAt }`. `PaymentStatus`.
- `AuthGuard` + `@CurrentUser() user: AuthUser` (`{ userId, tenantId, role, email }`). Prisma : `this.prisma.client.<model>`.
- Route détail event existante : `/dashboard/events/:eventId/candidates`.
- `apps/web/lib/use-latest-ref.ts` existe (utile pour ignorer les réponses stale).

## Architecture

### Backend — module `search`
`SearchController` + `SearchService`, sous `AuthGuard`. Un endpoint :

`GET /search?q=<string>&limit=<number>`
- `q` : trim ; si `< 2` caractères → renvoie des groupes vides (aucune requête DB).
- `limit` : défaut `5`, borné `[1, 20]`.
- Toujours scopé `user.tenantId`. `q` est passé à Prisma `contains` (paramétré → pas d'injection).

Réponse :
```ts
{
  query: string;
  events: Array<{ id: string; title: string; slug: string; status: string }>;
  candidates: Array<{ id: string; fullName: string; number: number; eventId: string; eventTitle: string }>;
  members: Array<{ id: string; email: string; role: string }>;        // [] si rôle STAFF
  payments: Array<{ id: string; providerRef: string | null; status: string; amountCfa: number; createdAt: string; eventId: string }>;  // [] si rôle STAFF
}
```

Requêtes (toutes `take: limit`, `orderBy` pertinent) :
- **events** : `where { tenantId, OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }`, `orderBy { createdAt: "desc" }`, select `{ id, title, slug, status }`.
- **candidates** : `where { fullName: { contains: q, mode: "insensitive" }, event: { tenantId } }`, include `event: { select: { id, title } }`, map → `{ id, fullName, number, eventId: event.id, eventTitle: event.title }`.
- **members** : `where { tenantId, email: { contains: q, mode: "insensitive" } }`, select `{ id, email, role }`. **Renvoyé uniquement** si `user.role !== "ORGANIZER_STAFF"` (sinon `[]`).
- **payments** : `where { tenantId, providerRef: { contains: q, mode: "insensitive" } }`, `orderBy { createdAt: "desc" }`, select `{ id, providerRef, status, amountCfa, createdAt, eventId }`. **Renvoyé uniquement** si `user.role !== "ORGANIZER_STAFF"` (sinon `[]`).

Helper interne `canSeeSensitive(role) = role !== "ORGANIZER_STAFF"`.

### Tests backend (vraie DB `votezpro_test`)
- **Isolation tenant** : un event/candidat/membre/paiement du tenant B n'apparaît JAMAIS dans la recherche d'un user du tenant A (même `q` correspondant). Contrôle critique.
- **Gating rôle** : un user `ORGANIZER_STAFF` reçoit `members: []` et `payments: []` même si des correspondances existent ; un OWNER les reçoit.
- **ILIKE insensible à la casse** : `q = "fin"` matche un event "Grande **Fin**ale".
- **q court** : `q = "a"` (1 car.) → tous les groupes vides, aucune requête.
- **Candidat via event** : un candidat matché est bien rattaché à son `eventId`/`eventTitle`, et un candidat d'un autre tenant n'apparaît pas.

### Frontend
**Couche données** `apps/web/lib/search.ts` :
```ts
export type SearchResults = { query: string; events: {...}[]; candidates: {...}[]; members: {...}[]; payments: {...}[] };
search(token: string, q: string, limit: number, signal?: AbortSignal): Promise<SearchResults>
```
+ helper `searchResultHref(kind, item)` centralisant les cibles de navigation.

**A. Palette header** — `components/dashboard-header.tsx` (recâble le champ recherche) :
- `Input` recherche, état local `q`, **debounce ~250 ms**, déclenche `search(token, q, 5, signal)` ; les réponses stale sont ignorées (`use-latest-ref` / compteur de requête + `AbortController`).
- **Dropdown** sous le champ : groupes non vides (Événements / Candidats / Membres / Paiements), chaque item = `Link` vers sa cible (voir ci-dessous), icône lucide par type. Pied « Voir tous les résultats → » → `/dashboard/search?q=<q>`.
- États : chargement (spinner discret), aucun résultat (« Aucun résultat »), erreur (message court). Fermeture sur `Échap` et clic extérieur ; `Entrée` → page résultats. A11y : `role="combobox"`/`aria-expanded` sur le champ, liste `role="listbox"` + `option`, labels.

**B. Page `/dashboard/search`** — `app/dashboard/search/page.tsx` (client ; `useSearchParams` enveloppé dans `<Suspense>`) :
- Lit `?q=`, appelle `search(token, q, 20)`. Champ de recherche en tête qui synchronise `?q=` (router.replace).
- Affiche tous les groupes non vides (titres de section + listes `vp-event-rows`), chaque item linké.
- États : `q` vide → invite (« Tapez pour rechercher ») ; chargement `LoadingState` ; aucun résultat `EmptyState` ; erreur `vp-error role=alert`.

**Cibles de navigation** (`searchResultHref`) :
- événement → `/dashboard/events/${id}/candidates`
- candidat → `/dashboard/events/${eventId}/candidates`
- membre → `/dashboard/team`
- paiement → `/dashboard/payments`

**Intégration** : clés i18n `search.*` + `nav`/header labels (fr/en) ; aucune string métier en dur. Le gating est backend (le front affiche les groupes renvoyés ; STAFF reçoit members/payments vides → groupes non affichés).

**Tests e2e Playwright** (`apps/web/tests/e2e/search.spec.ts`) :
- Login OWNER seedé (qui a au moins un événement) → taper dans le champ header → le dropdown montre l'événement → `Entrée` → `/dashboard/search?q=…` affiche le groupe Événements avec l'item.
- Respecter les gotchas e2e (`E2E_API_BASE_URL=:3011`, headless-shell).

## Sécurité
- **Isolation tenant** = contrôle primaire : chaque requête filtre `tenantId` (candidats via la relation `event.tenantId`). Test dédié anti-fuite cross-tenant.
- Gating rôle membres/paiements côté **serveur** (le masquage front n'est pas une garantie). STAFF n'obtient jamais d'emails ni de réfs de paiement.
- `q` paramétré via Prisma `contains` (pas de SQL brut) → pas d'injection. Longueur min 2 pour éviter les balayages massifs ; `limit` borné à 20.
- Pas de téléphone votant exposé (hashé, non cherchable, non renvoyé).

## Hors périmètre (YAGNI / plus tard)
- Recherche cross-tenant pour platform-admin (god-mode).
- Full-text / fuzzy (tsvector, pg_trgm), ranking par pertinence.
- Recherche par téléphone votant (hashé ; nécessiterait une recherche par hash exact, hors scope).
- Historique de recherche / suggestions récentes.
- Navigation clavier avancée dans le dropdown (flèches) — `Entrée`/clic/Échap suffisent au MVP.

## Critères de succès
- Un membre tape dans le header et voit, en typeahead, ses événements/candidats (+ membres/paiements s'il n'est pas STAFF), groupés, cliquables ; `Entrée` ouvre la page résultats complète.
- Aucune donnée d'un autre tenant n'apparaît jamais ; STAFF ne voit ni membres ni paiements.
- Tous états UX couverts ; WCAG AA ; tests backend vraie DB verts (dont isolation tenant + gating) ; typecheck + lint + build prod verts ; e2e verts.
