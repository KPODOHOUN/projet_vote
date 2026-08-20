# Phase B — Zone votante publique `/e/*` : confiance mobile, composants unifiés, i18n

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre la zone publique votante (4 routes : hub événement, profil candidat + funnel vote, résultats, billetterie) selon la stratégie validée : mobile-first 360 px, zone de paiement « secure-flow » calme et opaque, composants Phase A (Card `surface`, StatusChip, EmptyState, KpiCard, FormError, Button `loading`, Select DS), tokens sémantiques, i18n unifiée sur `lib/i18n.ts`. **Aucun changement de contrat API, aucune modification de la logique de paiement.**

**Architecture:** Pages RSC existantes conservées (SEO/`generateMetadata` par événement déjà bons — §4 de la spec). Refonte des surfaces et des états dans les fichiers existants ; restructuration unique : `/e/[slug]/tickets` passe d'une page client nue à un wrapper RSC brandé (`PublicEventShell`) + client inner sur React Query. Le hook `use-public-vote-payment.ts` n'est **pas** modifié.

**Tech Stack:** Next.js 15 App Router (RSC), React 19, Tailwind v4 (`@theme`), shadcn/ui vendored, TanStack React Query v5, framer-motion, lucide-react, TypeScript strict.

**Spec de référence:** `docs/superpowers/specs/2026-08-03-ux-redesign-strategy-design.md` (§5.3 zones, §5.5 composants, §5.3 bis garde-fous D2, D3 = cette zone en premier). **Plan précédent :** `2026-08-03-ux-redesign-phase-a-foundations.md` (livré : Card surface, StatusChip tokens, Button loading/44 px, hooks React Query, pattern i18n sidebar).

## Global Constraints

- **HOME FROZEN** : `app/page.tsx` et ses imports ne sont jamais modifiés ; `globals.css` n'est pas touché dans cette phase (sauf mention explicite d'une tâche).
- **Zéro modification d'API/contrat backend.** Endpoints consommés : `GET /votes/public/event/:slug`, `GET /votes/public/event/:slug/candidate/:ref`, `GET /votes/public/event/:slug/results`, `GET /public/events/:slug/ticket-types`, `POST /public/events/:slug/tickets/purchase`, `GET /public/tickets/:id`, flux vote (`/votes/cast`, `/payments/public/*`).
- **`apps/web/app/e/[slug]/use-public-vote-payment.ts` INTACT** (SSE + polling fallback, statusToken, idempotency). Aucune tâche ne le modifie.
- **Funnel vote = parcours revenu.** La structure du flux (presets quantité, attente honnête, `aria-live`, retry sans ressaisie, référence transaction) est conservée ; seuls la surface, les composants et les chaînes changent.
- **Zone sécurisée** : tout bloc de saisie de paiement (vote, achat billet) vit sous `data-zone="secure-flow"` (mécanisme existant `globals.css:635` qui restaure `--color-primary` plateforme sous un shell `data-event-theme`) avec surface **quasi opaque** (pas de `backdrop-blur` sur le conteneur du formulaire de paiement) — garde-fou D2 §5.3 bis.
- **Couleurs de statut : tokens sémantiques uniquement** (`--color-success`, `--color-warning`, `--color-error`, `--color-info`, `*-text`). Interdits dans les fichiers touchés : `emerald-*`, `amber-*` (statut), `sky-*`, `cyan-*`, `red-*` Tailwind bruts. Médailles podium : palette `gold-*` DS (1er) et neutres `slate-*` (2e/3e) — voir Task 6.
- **i18n unifiée** : nouvelles clés `pub.*` dans `apps/web/lib/i18n.ts` ; RSC → `translate(locale, key)` ; client → `useI18n().t(key)`. Zéro ternaire `isEn ? … : …`, zéro chaîne FR/EN en dur dans les fichiers touchés. `public-event-i18n.ts` est vidé de ses consommateurs puis retiré (Task 8).
- **Composants obligatoires** : `Card` avec prop `surface` ; `StatusChip` pour tout statut ; `EmptyState` pour tout état vide ; `FormError` pour toute erreur de formulaire ; `Button` (shadcn) avec prop `loading` — plus aucun `Loader2` inline dans un bouton des fichiers touchés ; `Select` DS (`components/ui/select.tsx`) à la place de tout `<select>` natif.
- **A11y** : touch targets ≥ 44 px (`min-h-11`) ; motion < 300 ms, jamais de motion wrapper sur un CTA de paiement au moment du submit ; `aria-live="polite"` conservé sur le suivi de paiement.
- **Perf mobile (D2 §5.3 bis)** : pas de nouveau `backdrop-blur` ; les pages gardent au plus leurs surfaces glass existantes (shell + 1 carte principale).
- **TypeScript strict, zéro `any`.** Gates par tâche : `cd apps/web && npm run typecheck && npm run lint` (47 warnings préexistants tolérés, aucun nouveau).
- **Commits** : un commit par tâche, uniquement après accord explicite de l'utilisateur.
- **Env e2e réparé** (2026-08-03) : `playwright.config.ts` pointe l'API webServer sur `votezpro_test` (`TEST_DATABASE_URL` surchargeable), `MAIL_RESEND_API_KEY` neutralisé, timeouts 300 s. Gate finale : `cd apps/web && npm run test:e2e` (depuis `apps/web`, jamais depuis la racine).

---

### Task 1 : Clés i18n `pub.*` (FR/EN) pour toute la zone

**Files:**
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/lib/i18n-provider.tsx`
- Modify: `apps/web/lib/public-event-i18n.ts` (réexport temporaire uniquement)

**Interfaces:**
- Consumes: structure `messages` + `translate(locale, key)` existante ; contexte `useI18n().t`.
- Produces: ~60 clés `pub.*` utilisées par les Tasks 2–7 ; `translateVars(locale, key, vars)` ; `useI18n().t(key, vars?)` (signature rétro-compatible) ; `publicEventDateLocale(locale)` déplacé ici (réexport temporaire dans `public-event-i18n.ts` pour ne pas casser les imports existants avant la Task 7).

Cette tâche centralise toutes les chaînes avant les refontes de pages : chaque page migrera vers ces clés sans avoir à inventer de libellés. Les textes reprennent les formulations existantes (hub/vote/results/tickets + `public-event-i18n.ts`), en comblant les manques (strings en dur de `results/page.tsx`).

- [ ] **Step 1: Ajouter le bloc `pub.*` au dictionnaire `fr` de `lib/i18n.ts`**

```ts
// Hub événement (/e/[slug])
"pub.closesOn": "Clôture le",
"pub.closedOn": "Fermé le",
"pub.voteClosed": "Le vote n'est pas ouvert",
"pub.seeLiveResults": "résultats en direct",
"pub.noCandidates": "Aucun candidat",
"pub.noCandidatesDesc": "Aucun candidat inscrit pour le moment.",
"pub.organizedBy": "Organisé par",
// Profil candidat (/e/[slug]/c/[ref])
"pub.candidateNumber": "Candidat n°{number}",
"pub.liveResults": "Résultats en direct",
"pub.eventCurrently": "Cet évènement est actuellement {status}.",
"pub.totalVotesLabel": "votes au total",
// Funnel vote (CandidateVoteClient)
"pub.pricePerVote": "Prix du vote",
"pub.numberOfVotes": "Nombre de votes",
"pub.customQuantity": "Quantité libre :",
"pub.votesUnit": "voix",
"pub.totalToPay": "Total à payer",
"pub.noPriceConfigured": "Cet évènement n'a pas encore de prix de vote défini.",
"pub.momoNumber": "Numéro Mobile Money",
"pub.momoHelp": "Saisissez votre numéro au format international (ex: +229 Bénin, +225 Côte d'Ivoire, +221 Sénégal).",
"pub.momoNetwork": "Réseau Mobile Money",
"pub.operatorAuto": "Détection automatique",
"pub.voteFor": "Voter pour",
"pub.processingPayment": "Paiement Sécurisé…",
"pub.voteStatusTitle": "Statut du vote",
"pub.pendingTitle": "Confirmation de paiement en attente",
"pub.pendingDesc": "Validez la demande de paiement reçue sur votre téléphone. Cette page se mettra à jour toute seule.",
"pub.confirmedTitle": "Vote Validé !",
"pub.confirmedDesc": "Merci ! Votre vote pour {name} a bien été enregistré.",
"pub.failedTitle": "Échec du paiement",
"pub.failedDesc": "Le paiement a été rejeté ou a échoué. Veuillez réessayer.",
"pub.retry": "Réessayer",
"pub.txRef": "Référence de transaction",
// Résultats (/e/[slug]/results)
"pub.resultsTitle": "Résultats en direct",
"pub.backToVote": "Retour au vote",
"pub.eventStatus": "Statut de l'évènement",
"pub.statusActive": "Actif / Ouvert",
"pub.statusClosed": "Terminé",
"pub.totalVotesCast": "Total des votes exprimés",
"pub.noVotesYet": "Aucun vote payé pour l'instant",
"pub.noVotesYetDesc": "Le classement s'affichera dès le premier vote confirmé.",
"pub.beFirst": "Soyez le premier à voter",
"pub.paidOnlyNote": "Seuls les votes payés et confirmés sont comptabilisés dans le classement.",
"pub.rank1": "1er",
"pub.rank2": "2e",
"pub.rank3": "3e",
"pub.votesCount": "{count} votes",
// Billetterie (/e/[slug]/tickets)
"pub.buyTickets": "Acheter des billets",
"pub.remainingCount": "{count} restants",
"pub.soldOut": "Épuisé",
"pub.maxPerPerson": "max {count}/personne",
"pub.noTickets": "Aucun billet disponible",
"pub.perTicket": "billet",
"pub.change": "Changer",
"pub.quantity": "Quantité",
"pub.yourInfo": "Vos informations",
"pub.nameOptional": "Votre nom (optionnel)",
"pub.phoneOptional": "Téléphone (optionnel)",
"pub.emailOptional": "Email (optionnel)",
"pub.pay": "Payer",
"pub.processing": "Traitement…",
"pub.purchaseConfirmed": "Achat confirmé !",
"pub.ticketType": "Type",
"pub.statusLabel": "Statut",
"pub.qrTitle": "Vos QR codes",
"pub.qrNote": "Conservez ces QR codes. Ils seront nécessaires pour l'entrée.",
"pub.qrAlt": "QR code du billet {id}",
"pub.backToEvent": "Retour à l'évènement",
"pub.loadError": "Erreur de chargement.",
"pub.purchaseError": "Erreur lors de l'achat",
"pub.voteNotFound": "Évènement introuvable",
"pub.candidateNotFound": "Candidat introuvable",
"pub.noTicketsDesc": "Revenez plus tard ou contactez l'organisateur.",
"pub.notFoundTitle": "Ce concours n'est pas disponible",
"pub.notFoundDesc": "Vérifiez le lien partagé par l'organisateur ou recherchez le code du concours.",
"pub.enterCode": "Entrer le code",
"pub.home": "Accueil",
```

- [ ] **Step 2: Miroir `en` (mêmes clés, formulations idiomatiques)**

```ts
"pub.closesOn": "Closes on",
"pub.closedOn": "Closed on",
"pub.voteClosed": "Voting is not open",
"pub.seeLiveResults": "live results",
"pub.noCandidates": "No candidates",
"pub.noCandidatesDesc": "No candidates registered yet.",
"pub.organizedBy": "Organized by",
"pub.candidateNumber": "Candidate no. {number}",
"pub.liveResults": "Live results",
"pub.eventCurrently": "This event is currently {status}.",
"pub.totalVotesLabel": "total votes",
"pub.pricePerVote": "Price per vote",
"pub.numberOfVotes": "Number of votes",
"pub.customQuantity": "Custom quantity:",
"pub.votesUnit": "votes",
"pub.totalToPay": "Total to pay",
"pub.noPriceConfigured": "This event has no voting price configured yet.",
"pub.momoNumber": "Mobile Money number",
"pub.momoHelp": "Enter your full international number (e.g. +229 Benin, +225 Ivory Coast, +221 Senegal).",
"pub.momoNetwork": "Mobile Money network",
"pub.operatorAuto": "Auto-detect",
"pub.voteFor": "Vote for",
"pub.processingPayment": "Processing Secure Payment…",
"pub.voteStatusTitle": "Vote status",
"pub.pendingTitle": "Pending payment confirmation",
"pub.pendingDesc": "Please approve the prompt sent to your phone. This screen will update automatically.",
"pub.confirmedTitle": "Vote Confirmed!",
"pub.confirmedDesc": "Thank you! Your vote for {name} has been recorded.",
"pub.failedTitle": "Payment Failed",
"pub.failedDesc": "The transaction was canceled or did not complete. Try again.",
"pub.retry": "Try again",
"pub.txRef": "Transaction Reference",
"pub.resultsTitle": "Live results",
"pub.backToVote": "Back to vote",
"pub.eventStatus": "Event Status",
"pub.statusActive": "Active / Open",
"pub.statusClosed": "Closed",
"pub.totalVotesCast": "Total Votes Cast",
"pub.noVotesYet": "No paid votes yet",
"pub.noVotesYetDesc": "The ranking will appear as soon as the first vote is confirmed.",
"pub.beFirst": "Be the first to vote",
"pub.paidOnlyNote": "Only paid and confirmed votes are counted in the ranking.",
"pub.rank1": "1st",
"pub.rank2": "2nd",
"pub.rank3": "3rd",
"pub.votesCount": "{count} votes",
"pub.buyTickets": "Buy Tickets",
"pub.remainingCount": "{count} remaining",
"pub.soldOut": "Sold out",
"pub.maxPerPerson": "max {count}/person",
"pub.noTickets": "No tickets available",
"pub.perTicket": "ticket",
"pub.change": "Change",
"pub.quantity": "Quantity",
"pub.yourInfo": "Your information",
"pub.nameOptional": "Your name (optional)",
"pub.phoneOptional": "Phone number (optional)",
"pub.emailOptional": "Email (optional)",
"pub.pay": "Pay",
"pub.processing": "Processing…",
"pub.purchaseConfirmed": "Purchase confirmed!",
"pub.ticketType": "Ticket type",
"pub.statusLabel": "Status",
"pub.qrTitle": "Your QR codes",
"pub.qrNote": "Save these QR codes. You'll need them for entry.",
"pub.qrAlt": "QR code for ticket {id}",
"pub.backToEvent": "Back to event",
"pub.loadError": "Loading failed.",
"pub.purchaseError": "Purchase failed",
"pub.voteNotFound": "Event not found",
"pub.candidateNotFound": "Candidate not found",
"pub.noTicketsDesc": "Check back later or contact the organizer.",
"pub.notFoundTitle": "This contest is not available",
"pub.notFoundDesc": "Check the link shared by the organizer or search for the event code.",
"pub.enterCode": "Enter event code",
"pub.home": "Home",
```

- [ ] **Step 3: Interpolation.** `translate(locale, key)` ne gère pas les variables. Ajouter un helper typé à côté de `translate` :

```ts
export function translateVars(locale: Locale, key: MessageKey, vars: Record<string, string | number>): string {
  return translate(locale, key).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}
```

Étendre le contexte dans `lib/i18n-provider.tsx` (rétro-compatible — les ~N consommateurs actuels à un seul argument ne changent pas) :

```ts
// AVANT
t: (key: MessageKey) => string;
…
t: (key) => translate(locale, key)
// APRÈS
t: (key: MessageKey, vars?: Record<string, string | number>) => string;
…
t: (key, vars) => (vars ? translateVars(locale, key, vars) : translate(locale, key))
```

- [ ] **Step 4: Déplacer `publicEventDateLocale`.** Copier la fonction dans `lib/i18n.ts` (inchangée : `en-GB`/`fr-FR`). Dans `public-event-i18n.ts`, remplacer l'implémentation par `export { publicEventDateLocale } from "./i18n";` (les 3 pages consommatrices actuelles continuent de compiler ; le module sera retiré en Task 8).

- [ ] **Step 5: Gates.** `cd apps/web && npm run typecheck && npm run lint` → 0 erreur, 47 warnings inchangés.

---

### Task 2 : Hub événement `/e/[slug]` — StatusChip, Card surface, EmptyState, i18n

**Files:**
- Modify: `apps/web/app/e/[slug]/page.tsx`

**Interfaces:**
- Consumes: `Card` (`components/ui/card`, prop `surface`), `StatusChip` (`components/ui/primitives`), `EmptyState` (idem), `translate`/`translateVars` (Task 1), `formatEventStatus` (existant), clés `pub.*`.
- Produces: même route, mêmes exports de types (`PublicCandidate`, `PublicEvent`, `PublicEventResponse`, `PublicOrganizer` — consommés par `animated-candidates-section.tsx`), même `generateMetadata` (les appels `publicEventMessage` des metadata migrent aussi vers `translate`).

Refonte surface uniquement : la structure hub (header → statut → annuaire candidats) est bonne ; on remplace les composants ad-hoc par les standards Phase A et les couleurs/statuts par les tokens.

- [ ] **Step 1: Statut via StatusChip.** Remplacer :

```tsx
// AVANT
<Badge variant={isOpen ? "default" : "secondary"} className={isOpen ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
  {statusLabel}
</Badge>
// APRÈS
<StatusChip tone={isOpen ? "live" : "muted"} label={statusLabel} />
```

Retirer l'import `Badge` devenu inutile.

- [ ] **Step 2: Carte principale via Card surface.** Remplacer la classe ad-hoc de la `Card` :

```tsx
// AVANT
<Card className="mb-8 w-full max-w-5xl overflow-hidden rounded-2xl border-none bg-background p-6 shadow-xl sm:p-10 lg:p-12">
// APRÈS (surface glass : zone publique événement = festive, lecture seule — §5.3)
<Card surface="glass" className="mb-8 w-full max-w-5xl overflow-hidden p-6 sm:p-10 lg:p-12">
```

- [ ] **Step 3: Bannière « vote fermé » sur tokens info.** Remplacer la boîte custom :

```tsx
// AVANT : <div className="p-6 rounded-xl bg-muted/50 border border-border/50 mb-10">…
// APRÈS
<div className="mb-10 rounded-xl border border-[var(--color-info)]/30 bg-[var(--color-info)]/10 p-6">
  <p className="text-center text-[var(--color-info-text)]">
    {t9n("pub.voteClosed")}{" "}
    <Link href={`/e/${event.slug}/results`} className="font-semibold underline underline-offset-2 hover:opacity-80">
      {t9n("pub.seeLiveResults")}
    </Link>
  </p>
</div>
```

- [ ] **Step 4: État « aucun candidat » via EmptyState.**

```tsx
// APRÈS
<EmptyState
  icon={<Users className="size-12 text-muted-foreground/50" aria-hidden="true" />}
  title={t9n("pub.noCandidates")}
  description={t9n("pub.noCandidatesDesc")}
/>
```

(`EmptyState` centre peu : passer `className` non supporté → envelopper dans `<div className="flex justify-center">` si le rendu décentre ; décision visuelle laissée au checkpoint.)

- [ ] **Step 5: i18n complète.** `const t9n = (key: MessageKey) => translate(locale, key);` ; remplacer `m(...)` (`publicEventMessage`), les ternaires `isEn ? "Organized by" : "Organisé par"` (`pub.organizedBy`), `closesOn`/`closedOn` ; metadata : `translate(locale, "pub.voteNotFound")`. `publicEventDateLocale` s'importe désormais de `lib/i18n`.

- [ ] **Step 6: `not-found.tsx` — i18n.** Migrer les 5 ternaires `isEn` vers `translate` : eyebrow `pub.voteNotFound`, titre `pub.notFoundTitle`, description `pub.notFoundDesc`, CTA primaire `pub.enterCode`, CTA secondaire `pub.home` (clés ajoutées en Task 1). Structure et `Button asChild` déjà conformes — aucun autre changement.

- [ ] **Step 7: Gates + checkpoint visuel 360/1280.** Vérifier e2e existant : `public-event.spec.ts` attend le texte « Le vote n'est pas ouvert » (conservé via clé), le heading titre, l'organisateur, le lien « résultats en direct » (libellé conservé), et le 404 sur slug inexistant → la spec doit passer sans modification.

---

### Task 3 : Profil candidat `/e/[slug]/c/[ref]` — Card surface + i18n (RSC)

**Files:**
- Modify: `apps/web/app/e/[slug]/c/[ref]/page.tsx`

**Interfaces:**
- Consumes: idem Task 2 + `translateVars` (`pub.candidateNumber`, `pub.eventCurrently` interpolées).
- Produces: même route/metadata ; `CandidateVoteClient` inchangé (Task 4).

La mise en page photo/gradient/numéro est une force (identité candidate) — conservée. Seuls la carte conteneur, les chaînes et le bloc « vote fermé » changent.

- [ ] **Step 1: Carte via Card surface.**

```tsx
// AVANT
<Card className="w-full max-w-5xl overflow-hidden rounded-3xl border border-border/40 bg-card/75 backdrop-blur-md shadow-2xl">
// APRÈS
<Card surface="glass" className="w-full max-w-5xl overflow-hidden p-0">
```

(Le `p-0` neutralise le `py-6` de base de Card : le layout interne flex gère ses propres paddings.)

- [ ] **Step 2: i18n.** Ternaires → clés : `pub.organizedBy`, `pub.liveResults`, `translateVars(locale, "pub.candidateNumber", { number: candidate.number })`, bloc fermé : `pub.voteClosed` + `translateVars(locale, "pub.eventCurrently", { status: statusLabel.toLowerCase() })`. Metadata « Candidat introuvable » → `pub.candidateNotFound`.

- [ ] **Step 3: Bloc « vote fermé » → bannière info tokens** (même pattern que Task 2 Step 3, sans lien).

- [ ] **Step 4: Gates + checkpoint visuel** (photo, badge numéro géant conservés ; grille 2 colonnes ≥ `md`, empilée mobile).

---

### Task 4 : Funnel vote `CandidateVoteClient` — secure-flow, Select DS, Button loading, tokens (CRITIQUE)

**Files:**
- Modify: `apps/web/app/e/[slug]/c/[ref]/CandidateVoteClient.tsx`

**Interfaces:**
- Consumes: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (`components/ui/select`), `Button` prop `loading`, `FormError` (`components/ui/form-error` — vérifier le chemin exact utilisé par `dashboard/page.tsx`), `useI18n().t` (Task 1), tokens `--color-success`.
- Produces: même composant/export, mêmes props ; **aucun changement** de `usePublicVotePayment`, du `submit`, du `reset`, de l'`aria-live`, de l'optimistic +1.

C'est le parcours revenu (95 % du trafic, majoritairement mobile 360 px). La logique est éprouvée ; on refond la surface : zone de paiement calme et opaque au milieu du branding événement, sélecteur opérateur enfin design-system, boutons tactiles, couleurs sémantiques.

- [ ] **Step 1: Conteneur secure-flow opaque.** Le bloc formulaire passe sous `data-zone="secure-flow"` (restaure `--color-primary` plateforme sous `data-event-theme`) et perd son blur :

```tsx
// AVANT
<div className="space-y-4 bg-muted/40 p-5 sm:p-6 rounded-2xl border border-border/50 backdrop-blur-sm">
// APRÈS
<div data-zone="secure-flow" className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
```

Appliquer le même `data-zone` + surface opaque à la section résultat (`payment-status`) : `bg-card border border-border rounded-2xl p-6 shadow-lg` (retirer `shadow-2xl` + `bg-card` déjà ok — harmoniser).

- [ ] **Step 2: Sélecteur opérateur → Select DS.** Valeur sentinelle `"auto"` ↔ `operator === ""` :

```tsx
// APRÈS
<Select value={operator || "auto"} onValueChange={(v) => setOperator(v === "auto" ? "" : v)}>
  <SelectTrigger id="operator" className="w-full text-base font-semibold data-[size=default]:h-12">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="auto">{t("pub.operatorAuto")}</SelectItem>
    <SelectItem value="mtn">MTN</SelectItem>
    <SelectItem value="moov">Moov</SelectItem>
    <SelectItem value="orange">Orange</SelectItem>
  </SelectContent>
</Select>
```

(Le `Label htmlFor="operator"` reste. **Piège de surcharge** : `SelectTrigger` porte `data-[size=default]:h-9` (36 px) qui, en spécificité CSS, l'emporterait sur un simple `h-12` — il faut la même data-variant pour surcharger, d'où `data-[size=default]:h-12` (48 px ✓ tactile). Radix interdit `SelectItem value=""` — d'où la sentinelle `"auto"`, déjà prévue.)

- [ ] **Step 3: CTA submit — Button `loading` natif, sans motion wrapper.** Retirer `<motion.div whileHover whileTap>` autour du bouton (garde-fou : pas de motion sur submit critique) :

```tsx
// APRÈS
<Button type="submit" size="lg" loading={isSubmitting}
  className="h-14 w-full text-base font-bold shadow-xl"
  disabled={!canSubmit}>
  {isSubmitting
    ? t("pub.processingPayment")
    : `${t("pub.voteFor")} ${candidateName} · ${quantity} ${t("pub.votesUnit")} · ${amountCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF`}
</Button>
```

(`loading` gère spinner + `aria-busy` + disable ; `canSubmit` inclut déjà `!isSubmitting`.)

- [ ] **Step 4: Touch targets.** Input quantité libre : `h-8 w-20` → `h-11 w-24` ; boutons preset : ajouter `min-h-11` ; input téléphone `h-12` conservé (48 px ✓).

- [ ] **Step 5: Succès/échec sur tokens.** Bloc succès :

```tsx
// AVANT : bg-emerald-500/5 border-emerald-500/10, bg-emerald-500/10 border-emerald-500/20, text-emerald-500, text-emerald-600 dark:text-emerald-400
// APRÈS : border-[var(--color-success)]/20 bg-[var(--color-success)]/5
//         icône wrapper : border-[var(--color-success)]/30 bg-[var(--color-success)]/10
//         CheckCircle2 : text-[var(--color-success)]
//         description : text-[var(--color-success-text)]
```

(Le `dark:text-emerald-400` disparaît avec le `text-emerald-600`.) Bloc échec : déjà en `destructive` — harmoniser `border-destructive/20 bg-destructive/5`, icône `bg-destructive/10 border-destructive/20`.

- [ ] **Step 6: Erreur bas de flux → FormError standard** (`components/ui/form-error`, children-based, `role="alert"` + `aria-live="assertive"` intégrés, rend `null` si vide) :

```tsx
// AVANT : <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 text-destructive border border-destructive/10" role="alert">…
// APRÈS : <FormError>{status.error}</FormError>
```

- [ ] **Step 7: i18n complète via `useI18n().t`** — toutes les chaînes du composant (labels prix/quantité/total, téléphone + aide, réseau, CTA, statuts, référence) avec les clés Task 1 ; `pub.confirmedDesc` interpolée (`{name}`).

- [ ] **Step 8: Gates + revue attentive du diff** (parcours revenu). Vérifier que `candidate-profile.spec.ts` et `public-event.spec.ts` restent verts (aucune chaîne qu'ils ciblent ne change de sens).

---

### Task 5 : Résultats `/e/[slug]/results` — i18n complète, tokens, podium DS

**Files:**
- Modify: `apps/web/app/e/[slug]/results/page.tsx`

**Interfaces:**
- Consumes: `KpiCard` (primitives), `EmptyState`, `StatusChip`, `translate`/`translateVars`, tokens `gold-*`/`slate`.
- Produces: même route/metadata ; invariant « votes payés seulement » affiché (clé `pub.paidOnlyNote`).

La page la plus festive (podium) reste festive — c'est la zone événement — mais ses couleurs passent aux tokens DS : or = palette `gold` plateforme, neutres = `slate`, barres = gradient événement.

- [ ] **Step 1: i18n complète.** Les 4 chaînes FR en dur (`Aucun candidat`, `Aucun vote payé pour l'instant`, `Le classement s'affichera…`, note finale `Seuls les votes…`) + labels KPI + podium (`1er/2e/3e`) + `votes` → clés `pub.*` (`translateVars` pour `pub.votesCount`).

- [ ] **Step 2: KPI via composants standards.**

```tsx
// AVANT : deux div custom "flex flex-col p-4 rounded-2xl border border-border/30 bg-card/10 backdrop-blur-sm"
//           avec text-emerald-500 / text-sky-500
// APRÈS
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  <KpiCard label={t9n("pub.eventStatus")} value={isOpen ? t9n("pub.statusActive") : t9n("pub.statusClosed")} />
  <KpiCard label={t9n("pub.totalVotesCast")} value={totals.votes.toLocaleString("fr-FR")} />
</div>
```

(`KpiCard` rend déjà `tabular-nums` + font display ; plus de couleur ad-hoc — le statut est aussi porté par le `StatusChip` de l'en-tête si présent, sinon texte neutre : décision = texte neutre, la couleur de statut vit dans `StatusChip`.)

- [ ] **Step 3: Empty states → EmptyState.** `ranked.length === 0` → `EmptyState(title: pub.noCandidates, description: pub.noCandidatesDesc)` ; `totals.votes === 0` → `EmptyState(title: pub.noVotesYet, description: pub.noVotesYetDesc, action: <Link …>{pub.beFirst}</Link>)` — l'action garde le style pilule `bg-primary` actuel converti en `Button asChild` :

```tsx
action={<Button asChild><Link href={`/e/${event.slug}`}>{t9n("pub.beFirst")}</Link></Button>}
```

- [ ] **Step 4: Podium aux tokens.** `podiumConfig` :

```tsx
// 1er : badge "bg-gold-400 text-gold-950 border-gold-500/20" → tokens : bg-[var(--color-gold-400)] text-[var(--color-gold-900)] border-[var(--color-gold-500)]/30 ; ring : border-[var(--color-gold-400)]/50
// 2e : slate conservé (neutre autorisé)
// 3e : amber-700 → gold-700 : bg-[var(--color-gold-700)] text-[var(--color-gold-50)] border-[var(--color-gold-700)]/30 ; ring border-[var(--color-gold-700)]/40
```

Médailles de la liste (`medalColors`) : même mapping (`amber-400/10 text-amber-600` → `[var(--color-gold-400)]/10 text-[var(--color-gold-700)]`, `amber-700/10` → `[var(--color-gold-700)]/10 text-[var(--color-gold-700)]`).

- [ ] **Step 5: Barres de progression → gradient événement.**

```tsx
// AVANT : bg-gradient-to-r from-primary to-cyan-500
// APRÈS : bg-gradient-to-r from-[var(--event-gradient-start)] to-[var(--event-gradient-end)]
// (toujours définies : PublicEventShell pose data-event-theme avec buildEventTheme — lib/brand.ts:115-116)
```

- [ ] **Step 6: Gates + checkpoint visuel** (podium 3 candidats, liste > 3, états vides, 360 px).

---

### Task 6 : Billetterie `/e/[slug]/tickets` — shell brandé, React Query, composants standards

**Files:**
- Modify: `apps/web/app/e/[slug]/tickets/page.tsx` (devient wrapper RSC)
- Create: `apps/web/app/e/[slug]/tickets/tickets-client.tsx`
- Create: `apps/web/lib/hooks/use-public-tickets.ts`

**Interfaces:**
- Consumes: `PublicEventShell` (+ `fetchPublicEvent` pattern de la page hub — dupliquer le fetch minimal ou extraire un helper partagé `lib/public-event-fetch.ts` : décision = extraire, les pages hub/results partagent déjà le pattern), `useQuery`, `FormError`, `Button loading`, `EmptyState`.
- Produces: route identique ; page désormais SSR-shell (branding événement, header/footer, SEO de base hérité du layout) ; hook `usePublicTicketTypes(slug)`.

La page actuelle est une page client **nue** (pas de shell, pas de branding, fetch impératif, erreurs custom) : c'est la seule restructuration structurelle de la phase. Le funnel d'achat conserve sa logique (endpoints inchangés).

- [ ] **Step 1: Hook React Query.**

```ts
// lib/hooks/use-public-tickets.ts
export function usePublicTicketTypes(slug: string) {
  return useQuery({
    queryKey: ["public-ticket-types", slug],
    queryFn: () => apiFetch<PublicTicketType[]>(`/public/events/${slug}/ticket-types`),
    retry: 1,
    staleTime: 30_000
  });
}
```

- [ ] **Step 2: Wrapper RSC.** `page.tsx` : fetch `GET /votes/public/event/:slug` (pattern `fetchPublicEvent`, `cache: "no-store"`) → `notFound()` si absent → `<PublicEventShell …showResultsLink><TicketsClient slug={slug} /></PublicEventShell>`. `generateMetadata` minimal (`title: translate(locale,"pub.buyTickets") + " · " + event.title`).

- [ ] **Step 3: Client inner.** Déplacer le corps actuel dans `tickets-client.tsx` ; remplacer le `useEffect` fetch par le hook ; `isLoading` → `<LoadingState variant="rows" count={3} />` (conservé) ; erreurs → `<FormError>{error}</FormError>` et `<FormError>{purchaseError}</FormError>` ; état « aucun billet » → `EmptyState(title: pub.noTickets, description: pub.noTicketsDesc)`.

- [ ] **Step 4: CTA payer → Button loading** (`loading={isPurchasing}`, libellé `t("pub.pay")` + montant ; retirer le `Loader2` inline).

- [ ] **Step 5: Succès → tokens** (`emerald-500/*` → `[var(--color-success…)]`, même mapping que Task 4 Step 5) ; `Badge` statut ticket → `StatusChip` (mapping : `PAID/VALID` → `success`, sinon `pending` ; vérifier les statuts réels de l'API).

- [ ] **Step 6: QR codes.** `src={`${window.location.origin}/api/tickets/${t.id}/qr`}` → chemin relatif `/api/tickets/${t.id}/qr` (même origine, SSR-safe) ; `alt` descriptif via `translateVars(locale, "pub.qrAlt", { id: t.id.slice(0, 8) })` ; ajouter `width={64} height={64}` pour éviter le CLS ; conserver `<img>` (route dynamique — `next/image` non justifié ici) et le fallback `onError`.

- [ ] **Step 7: i18n complète** (`useI18n().t`, clés `pub.*` dont `pub.remainingCount`, `pub.maxPerPerson`, `pub.perTicket` interpolées).

- [ ] **Step 8: Gates + checkpoint visuel** (liste types → sélection → formulaire → succès, 360 px).

---

### Task 7 : Helper partagé + retrait de `public-event-i18n.ts`

**Files:**
- Create: `apps/web/lib/public-event-fetch.ts` (si non créé en Task 6)
- Modify: `apps/web/app/e/[slug]/page.tsx`, `apps/web/app/e/[slug]/results/page.tsx`, `apps/web/app/e/[slug]/c/[ref]/page.tsx` (imports)
- Delete: `apps/web/lib/public-event-i18n.ts`

**Interfaces:**
- Consumes: Tasks 2–6 terminées.
- Produces: `fetchPublicEvent(slug)` unique (no-store, typé) ; zéro consommateur de `publicEventMessage`.

- [ ] **Step 1: Extraire `fetchPublicEvent`** (copie conforme de celle du hub, types inclus) et faire pointer les 4 pages dessus.

- [ ] **Step 2: Vérifier l'absence de consommateurs** : `rg "publicEventMessage|public-event-i18n" apps/web` → 0 résultat attendu (hors le fichier lui-même).

- [ ] **Step 3: Supprimer `apps/web/lib/public-event-i18n.ts`.** `publicEventDateLocale` vit déjà dans `lib/i18n.ts` (Task 1 Step 4) — corriger les imports résiduels.

- [ ] **Step 4: Gates.**

---

### Task 8 : Gates finales + revue visuelle de la zone

**Files:** aucun (validation seule).

- [ ] **Step 1: Gates automatisées** : `cd apps/web && npm run typecheck && npm run lint && npm run build` → 0 erreur ; warnings inchangés (47) ; aucune nouvelle classe ad-hoc : `rg "emerald-|amber-|sky-|cyan-" "apps/web/app/e"` → 0 ; `rg "isEn \?" "apps/web/app/e"` → 0 ; `rg "<select" "apps/web/app/e"` → 0.

- [ ] **Step 2: E2E ciblés** : `cd apps/web && npx playwright test tests/e2e/public-event.spec.ts tests/e2e/candidate-profile.spec.ts tests/e2e/legacy-vote-redirect.spec.ts` → verts (env réparé : API sur `votezpro_test`, timeouts 300 s).

- [ ] **Step 3: Revue visuelle manuelle (checklist utilisateur)** sur device 360 px et 1280 px :
  1. Hub `/e/[slug]` : statut chip, carte glass, bannière info si fermé, empty state.
  2. Profil candidat : photo/badge conservés, bloc paiement opaque et neutre (brand plateforme), Select opérateur DS ouvrable au clavier, CTA 56 px avec spinner natif, presets tactiles ≥ 44 px.
  3. Funnel : succès en vert sémantique, échec + réessai sans ressaisie, référence transaction lisible.
  4. Résultats : podium or/argent/bronze DS, barres gradient événement, note invariant, empty + CTA.
  5. Billetterie : shell brandé, achat, succès, QR visibles.
  6. `prefers-reduced-motion` : aucune animation gênante (devtools → rendering → emulate).

- [ ] **Step 4: Verdict de phase** — GO si gates vertes + revue validée ; sinon boucle fix/re-review.

---

## Hors périmètre Phase B

- Pages auth, dashboard, admin (Phases C/D/E) ; Home (gelée) ; `candidate-share-bar`, `candidate-photo`, `public-event-header` (composants partagés déjà sains — retouche éventuelle en Phase F polish) ; logique de paiement et contrats API ; SEO au-delà de la conservation des metadata existantes.
