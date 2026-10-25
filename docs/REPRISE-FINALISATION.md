# Reprise — finalisation SHADOMA

Document mis à jour après chaque lot. Branche : `chore/finalisation-shadoma` (locale, jamais poussée).

## Lot 0 — Pré-vol (2026-10-25) : terminé

### Git
- Branche créée depuis `main` @ `6d2bda5`.
- Commit `8d0e43b` « wip: état préexistant avant finalisation » : 11 fichiers déjà modifiés (OAuth, brand, i18n, header public, globals.css, 2 docs). Sans `.env`, sans fichiers parasites.
- Fichiers parasites encore présents (traités au Lot B8) : `t p = new PrismaClient();` (versionné, sortie de `less`), `test-push2` (versionné, vide).

### Environnement
- Node v22.22.3, npm 10.9.8.
- Disque plein à l'ouverture de session (0 Mo) : `node_modules` corrompu (4 344 fichiers `.js` vides). Libéré ~20 Go (cache de build Docker, images inutilisées, cache npm), puis `npm ci` + `prisma generate`.
- Postgres : conteneur `votezpro-postgres` (port 5433), bases `votezpro` et `votezpro_test`. Redis non requis par les tests.
- **Piège** : le mot de passe de `DATABASE_URL` dans `.env` ne correspond plus au conteneur. Le défaut `votezpro_dev` des scripts non plus. Il faut exporter `TEST_DATABASE_URL` avec le mot de passe du conteneur (`docker inspect votezpro-postgres`), et lancer `test:offers` avec `DATABASE_URL="$TEST_DATABASE_URL"` (sinon il écrit dans la base de dev via `.env`).

### Baseline (avant toute modification)
| Commande | Résultat |
|---|---|
| build `packages/shared`, `packages/db` | OK |
| `apps/api` typecheck (source) | 0 erreur |
| `tsc -p apps/api/tsconfig.test.json` | 0 erreur |
| `apps/web` typecheck | 0 erreur |
| lint API | 0 erreur, 0 warning |
| lint web | 0 erreur, 43 warnings |
| `apps/api npm test` | 229/230 — échec : `app.integration.test.ts:404` (commission attendue 100, reçue 0) |
| `apps/api test:offers` | 31/32 — échec : `event-settlement.service.test.ts:59` (retenue 25 au lieu de 0) |
| build web | OK — `/` 249 kB, First Load 573 kB |
| e2e Playwright | non exécuté (à faire au Lot H) |

### Échecs préexistants (dette, pas régression)
1. `app.integration.test.ts` règle la clé legacy `commission_bps` pour un tenant ESCROW ; depuis `c5a99e4`, ESCROW lit `offer2_per_vote_commission_enabled/bps` (désactivé par défaut → 0). Test en retard sur le code.
2. `test:offers` tourne sans `--test-concurrency=1` : les fichiers partagent `PlatformSetting` dans la même base et s'interfèrent. Le fichier seul passe 2/2.

## Lot A — Audit en lecture seule (2026-10-25) : terminé

Aucune modification de code. Statut de chaque constat de la section 3.2 du prompt, avec preuve.

### Nouveaux constats (absents du prompt)
| Prio | Constat | Preuve | Correction prévue |
|---|---|---|---|
| **P0** | Aucun organisateur ne peut retirer : l'API exige une destination Mobile Money, mais aucune UI ne la configure | `offers/withdrawals.service.ts:42` ; `payouts/payouts.controller.ts:52` (`organizer/payout-destination`) ; aucun appel dans `apps/web` | Lot B3 : section « Numéro de retrait » dans Compte + lien depuis le wallet |
| **P1** | `package-lock.json` non versionné et listé dans `.gitignore` ; la CI fait `npm ci` (échoue sans lockfile) | `.gitignore` ; `git ls-files package-lock.json` vide ; `.github/workflows/*.yml:30,83` | Lot B8 : retirer du `.gitignore`, versionner le lockfile |
| P1 | Échec silencieux de l'OTP en production : `mail.send` renvoie `false`, l'API répond succès | `auth/auth.service.ts:973-988` | Lot B5 |
| P2 | `test:offers` sans `--test-concurrency=1` (tests qui se marchent dessus) ; test d'intégration commission en retard sur ESCROW | voir baseline | Lot B3 |
| P2 | Lien vers une page legacy depuis l'accueil admin | `app/admin/page.tsx:85` (`/admin/payouts`) | Lot B10 |

### Constats du prompt : revérification
| Constat | Statut | Preuve |
|---|---|---|
| Billetterie : `PENDING` + `FEEXPAY` codé en dur, sans PSP, confirmation seulement en démo | confirmé | `tickets/tickets.service.ts:263,277-289` |
| Scan d'un billet non payé | **déjà corrigé** (refusé) | `tickets.service.ts` ~l.368 (`n'a pas encore été payé`) |
| `payment-verify.service.ts` seul écrivain de `SUCCEEDED` | à vérifier en B3 (hors : démo billets `tickets.service.ts:287`) | |
| `MAIL_RESEND_API_KEY` non exigé en production | confirmé | `config/env.ts:119` (optionnel), aucun refine prod |
| Chat sans DTO ni plafond | confirmé (`max_tokens: 300` déjà borné) | `chat/chat.controller.ts:11`, `chat.service.ts:51` |
| Aucune en-tête de sécurité Next | confirmé | `apps/web/next.config.ts` (aucun `headers()`) |
| Jeton hors `localStorage` | confirmé OK (seuls code d'organisation et brouillons de formulaire y sont) | `lib/auth.ts:5-19`, `lib/organizer-storage.ts` |
| `.gitignore` exclut `vercel.json`, Dockerfile, `.env.*` ; pas de `.env.example` | confirmé | `.gitignore` |
| Drift de schéma | **résolu** : `migrate diff` base de test vs schéma = 0 | e2e encore en `db push` : `apps/web/playwright.config.ts:57-60` |
| Fichiers parasites | confirmé | `t p = new PrismaClient();`, `test-push2` versionnés |
| `i.pravatar.cc` autorisé | confirmé | `next.config.ts:21` |
| 1 180 `isEn ?` / 90 fichiers ; 8 fichiers `<img>` / 2 `next/image` | confirmé (identique) | `rg` |
| `HeroThreeScene` monté sur la Home ; `/e/miss-campus-2026` en dur | confirmé (3 occurrences) | `app/page.tsx:14,150` |
| Pas de manifest ni d'image OG | confirmé | `apps/web/app` |
| Thème : seuil 0,38, défaut `#6366F1`, `accentAlt`, `--event-gradient-*`, `--event-glow` | confirmé | `lib/brand.ts:44,97-118` |
| En-tête public : dégradé au scroll, `animate-pulse`, `hover:scale-105`, `rounded-full`, `text-[10px] opacity-75`, « Live results », `onMouseEnter` | confirmé | `components/public-event-header.tsx:66,81,98,103,106,107` |
| Phase de vote calculée sur le seul statut ; serveur borne `[startsAt, endsAt]` | confirmé | `app/e/[slug]/page.tsx:73`, `c/[ref]/page.tsx:92` ; `votes/votes.service.ts:345` |
| Éditeur : impossible d'effacer slogan/logo/couleur | confirmé | `events/events.service.ts:45-47,742-744` ; `design/page.tsx:147` |
| Éditeur : « Aperçu en direct », « Ardoise premium » | confirmé | `design/page.tsx:388` ; `lib/brand.ts:181` |
| `extractColorFromImage` sans `try/catch` ni filtre blanc/gris | confirmé | `lib/brand.ts:141-159` |
| Pages legacy accessibles par URL | confirmé ; sidebar admin les range sous Legacy ; `plan-upgrade-modal.tsx:206` non monté | `components/admin-sidebar.tsx:80,84` |

### Plan ajusté
- **B** commence par le P0 retrait (B3), le lockfile (B8) et les deux tests rouges, puis le reste dans l'ordre du prompt.
- C à H inchangés.

## Lot B — Intégrité, vérité métier, hygiène (2026-10-25) : terminé

Méthode : TDD (test RED exécuté, puis GREEN) pour chaque changement de logique serveur. Un commit par sujet.

| Commit | Sujet | Preuve |
|---|---|---|
| `d68cf03` | Baseline verte : test d'intégration aligné sur la commission ESCROW et les rôles relus en base ; `test:offers` séquentiel | 230/230, 32/32 |
| `558fe1d` | **P0** : numéro de retrait configurable (GET additif `organizer/payout-destination`, panneau Compte, rappel sous le formulaire de retrait, bouton désactivé sans numéro) | `payouts.service.test.ts` 9/9 |
| `75c7fca` | B1 billetterie : 503 hors démo avant toute écriture ; UI fermée par défaut (`NEXT_PUBLIC_TICKET_SALES_OPEN`) ; `/t/[ticketId]` en i18n | `tickets.service.test.ts` 3/3 |
| `24e72ef` | B5 : `MAIL_RESEND_API_KEY` obligatoire en production ; inscription → 503 si l'OTP ne part pas | `config/env.test.ts` 3/3, `auth-otp.offer.test.ts` 3/3 |
| `f3ba873` | B6 chat : zod 1–500, plafonds journaliers IP/global, 503 sans clé, `GET /chat/status`, widget masqué sans clé | `chat.service.test.ts` 4/4 |
| `666107a` | B7 en-têtes Next + CSP Report-Only ; `i.pravatar.cc` retiré | `docs/deployment/security-headers.md` |
| `f2e0e86` | B8 : lockfile versionné, `.env.example`, modèles de déploiement, ADR-012, DESIGN_VISION remplacé, fichiers parasites supprimés | — |
| `a59749f` | B2 : compteur = quantité payée après SUCCEEDED (plus de « +1 ») ; script `test` web (+ CI) | web `npm test` 4/4 |
| `a6790e8` | B3 : **transitions de retrait atomiques** (double rejet = double restitution ; rejet ∥ approbation) | `withdrawals.service.test.ts` 7/7 (2 RED avant correctif), stable ×3 |
| `cb74169` | B4 : admin retraits — paragraphe permanent, confirmation « Marquer payé », motif obligatoire en dialogue, statuts localisés (PAID = « Marqué payé par SHADOMA »), cartes < 768 px ; `ConfirmDialog.confirmDisabled` | typecheck/lint |
| `4928ab3` | B4 : commission admin (taux effectif, source, bornes depuis les garde-fous, gel) | `offer-settings.service.test.ts` +1, `test:offers` 33/33 |
| `ca047f9` | B9 : drift nul prouvé sur base vierge (39 migrations, `migrate diff` = 0) → e2e en `migrate deploy` ; B10 : liens legacy retirés de l'accueil admin | — |

### Gates après Lot B
| Commande | Résultat |
|---|---|
| typecheck API / API tests / web | 0 / 0 / 0 erreur |
| lint API / web | 0 / 0 erreur ; web 43 warnings (= baseline) |
| `apps/api npm test` | **249/249** |
| `apps/api test:offers` | **33/33** |
| `apps/web npm test` | 4/4 |
| e2e Playwright (`migrate deploy`) | **19/19** (2,2 min) |

### Constats ouverts (Lot B)
- P2 : les entrées `WalletLedgerEntry` ne sont pas signées et `ADJUSTMENT` sert de crédit (rejet de retrait) ; une réconciliation générique ledger ↔ soldes exige une convention de signe. Pas de changement de schéma fait.
- P2 : plafonds journaliers du chat en mémoire du processus (multipliés par le nombre d'instances).
- Hypothèse : `resendOtp` / `forgotPassword` gardent le message anti-énumération en cas d'échec d'envoi (seule l'inscription renvoie 503), pour ne pas révéler l'existence d'un compte.
- B3 « commission prélevée » côté wallet : l'API wallet ne renvoie pas de total de commission ; la vue n'en affiche aucun (rien de deviné). Ajout additif possible au Lot E.

### Pièges
- Playwright 1.62 attend `chromium_headless_shell-1234` : `npx playwright install --only-shell chromium` (sinon les 19 specs échouent au lancement du navigateur, sans rien tester).
- Le hook GateGuard bloque la première écriture de chaque fichier ; la réessayer passe.

## Lot C — Tokens et moteur de thème (2026-10-25) : terminé

Commit `68e1300` (correction : son message dit « 20 presets », il y en a **18**). Tests `lib/brand.test.ts` 8/8 (18 presets + 7 couleurs libres + 500 aléatoires à graine fixe).

- Moteur 9.11-a dans `lib/brand.ts` : `accentStrong`, en-tête garanti ≥ 4,5:1, défaut `#4F46E5`, exports publics conservés (+ `contrastRatio`, `deriveAccentStrong`, `DEFAULT_BRAND_COLOR`).
- `accentAlt`, `--event-gradient-*`, `--event-glow` supprimés ; 3 usages passés en aplat. `rg` : 0 occurrence restante.
- `[data-event-theme]` (globals.css) ne remet plus la couleur brute en `--color-primary`.
- Tokens corrigés (mesurés sur blanc) : primary `brand-500` 4,47 → `brand-600` 6,29 ; `success-text` 3,77 → 5,48 ; destructif 3,76 → 4,83 ; zone `secure-flow` en `brand-600`.
- `design-system/` (tokens.ts, theme.css) n'est importé nulle part par l'app : copie de référence, laissée en l'état.
- `isEn ?` : 1 180 → 1 169 (migration poursuivie au Lot D sur `/e/*`, auth, Home).

### Matrice de contraste (avant → après le moteur)
✗ = sous 4,5:1. Avant : en-tête = texte choisi par le seuil 0,38 ; texte primaire = couleur brute sur blanc.

| Couleur | Hex | En-tête avant | Texte primaire avant | En-tête après | Texte primaire après (accentStrong) |
|---|---|---|---|---|---|
| Indigo royal | `#6366f1` | 4.47 ✗ | 4.47 ✗ | 4.61 | 4.61 (`#6063f1`) |
| Violet électrique | `#8b5cf6` | 4.23 ✗ | 4.23 ✗ | 4.71 | 4.71 (`#8351f5`) |
| Bleu nuit profond | `#0f172a` | 17.85 | 17.85 | 17.85 | 17.85 (`#0f172a`) |
| Ardoise premium | `#1e293b` | 14.63 | 14.63 | 14.63 | 14.63 (`#1e293b`) |
| Or chatoyant | `#f59e0b` | 8.31 | 2.15 ✗ | 8.31 | 4.65 (`#a26807`) |
| Rouge passion | `#ef4444` | 3.76 ✗ | 3.76 ✗ | 4.74 | 4.52 (`#eb1414`) |
| Orange feu | `#f97316` | 2.80 ✗ | 2.80 ✗ | 6.37 | 4.66 (`#c25205`) |
| Rose élégant | `#ec4899` | 3.53 ✗ | 3.53 ✗ | 5.06 | 4.51 (`#e2187c`) |
| Émeraude | `#10b981` | 2.54 ✗ | 2.54 ✗ | 7.04 | 4.76 (`#0b835c`) |
| Forêt profonde | `#059669` | 3.77 ✗ | 3.77 ✗ | 4.74 | 4.65 (`#04855d`) |
| Teal océan | `#0d9488` | 3.74 ✗ | 3.74 ✗ | 4.77 | 4.63 (`#0c8379`) |
| Turquoise | `#14b8a6` | 2.49 ✗ | 2.49 ✗ | 7.17 | 4.52 (`#0e8578`) |
| Bleu confiance | `#3b82f6` | 3.68 ✗ | 3.68 ✗ | 4.85 | 4.63 (`#1a6df4`) |
| Ciel serein | `#0ea5e9` | 2.77 ✗ | 2.77 ✗ | 6.44 | 4.52 (`#0b7eb2`) |
| Terre d'Afrique | `#7c2d12` | 9.37 | 9.37 | 9.37 | 9.37 (`#7c2d12`) |
| Cuir noble | `#b45309` | 5.02 | 5.02 | 5.02 | 5.02 (`#b45309`) |
| Rouge écarlate | `#e11d48` | 4.70 | 4.70 | 4.70 | 4.70 (`#e11d48`) |
| Bleu dynamique | `#0284c7` | 4.10 ✗ | 4.10 ✗ | 4.56 | 4.56 (`#027cbb`) |
| Blanc (saisi) | `#ffffff` | 17.85 | 1.00 ✗ | 17.85 | 4.61 (`#757575`) |
| Jaune pâle (saisi) | `#fff9c4` | 16.66 | 1.07 ✗ | 16.66 | 4.53 (`#857700`) |
| Gris clair (saisi) | `#e5e7eb` | 14.42 | 1.24 ✗ | 14.42 | 4.64 (`#6a758a`) |

Bilan sur 21 couleurs : en-tête 12 échecs → 0 ; texte primaire 16 échecs → 0.



## Lot L — Sens du journal wallet (2026-10-25) : terminé

Décision D6, étendue : `direction` **et** `bucket` (compartiment), car `VOTE_CREDIT` touche la réserve ou le disponible selon le modèle ; sans compartiment, aucune réconciliation par solde n'est possible. ADR : `docs/adr/ADR-021-ledger-direction.md`.

| Commit | Sujet | Preuve |
|---|---|---|
| `8938360` | Migration additive `20261025120000_ledger_direction` (enums `LedgerDirection`, `LedgerBucket`, colonnes nullables) + backfill déterministe | base vierge : 40 migrations, `migrate diff` = 0 ; base peuplée avant migration (9 lignes synthétiques, tous les `kind`) : montants intacts, 7 décidées, **2 restent NULL** (un `VOTE_CREDIT` sans `HELD_ALLOCATION` jumelle, un `ADJUSTMENT` hors rejet) |
| `3558fda` | `appendLedgerEntry` (offers/ledger-entry.ts), `direction`/`bucket` obligatoires au type ; les 5 sites de `WalletService` passent par lui | `ledger-entry.test.ts` 2/2 (**RED vu** : 2 échecs avant), scan source : aucune écriture ailleurs |
| `6574644` | `LedgerConsistencyService.reconcileWallets()` : soldes stockés ↔ journal signé, `HELD_RELEASE` = transfert, lignes NULL « inconnues » → statut `unverifiable` | 4 scénarios (flux complet vote/réserve/libération/retrait rejeté/payé ; écart ; ligne inconnue ; concurrence) 7/7 stable ×3 ; **RED vu** à la compilation |

Base de dev locale : la table n'existe pas (base non migrée), donc 0 ligne réelle à compter. En production, compter les lignes inconnues après `migrate deploy` :
`SELECT count(*) FROM "WalletLedgerEntry" WHERE direction IS NULL OR bucket IS NULL;`

Gates : API 253/253, `test:offers` 35/35, typecheck 0, lint API 0.

### Hypothèses
- H-L1 : `bucket` ajouté en plus de `direction` (D6) ; nécessaire à la réconciliation par compartiment.
- H-L2 : `HELD_RELEASE` reste une seule ligne (`CREDIT WITHDRAWABLE`, débit implicite de `HELD`) pour ne pas changer les sommes de `EventSettlementService`.
- H-L3 : la réconciliation n'est pas encore exposée par une route ; F1 l'affiche côté admin.

## Lot D0 — Compléments du Lot B (2026-10-25) : terminé

| Commit | Sujet | Preuve |
|---|---|---|
| `048a934` | D0-1 prompt système du chatbot réécrit sur le flux réel (aucun taux, délai, opérateur, adresse inventée ; `contact@shadowa.votes` n'existait nulle part) | `chat.service.test.ts` : scan des termes interdits, RED sur l'ancien prompt |
| `6ec7827` | D0-2 `CSP_REPORT_URI` optionnel (`report-uri`, `report-to`, `Reporting-Endpoints`) ; critère de passage en bloquant : 7 jours sans violation légitime | `headers()` vérifié avec et sans variable |
| `42a371d` | D0-4 plafonds du chatbot partagés via Redis si `API_REDIS_URL` (clé par jour, expiration 2 j) ; un appel refusé ne consomme pas le quota | `chat.service.test.ts` 6/6 (cas deux instances RED puis GREEN) |
| `a8c0260` | D0-3 `.env.example` et `staging-production.md` : variables front figées au build, `CSP_REPORT_URI`, plafonds | — |

## Lot D — Zone publique (2026-10-25) : en cours

| Commit | Sujet | Preuve |
|---|---|---|
| `1fe3783` | D1+D2 Home réécrite selon 7.3 (aplat `slate-900`, texte à gauche, liste numérotée, « Comment l'argent est séparé », FAQ en `<dl>`), header wordmark à un CTA, footer sans fausse newsletter ni faux réseaux sociaux ; lien de démo `/vote` conditionné à `NEXT_PUBLIC_DEMO_EVENT_SLUG` | `/` 249 kB → 2,44 kB ; First Load 573 → 324 kB ; e2e 19/19 |
| `12b08e9` | D3 en-tête d'événement à plat (variables du moteur), « Résultats »/« Billets » en liens soulignés, pied « Concours hébergé par » | typecheck, lint 43 |
| `3119e35` | D4 `lib/vote-phase.ts`, hub (bandeau, « Comment voter » lisant `MOBILE_NETWORKS`, grille hors carte), `PhaseNotice`, `lib/format.ts`, métadonnées localisées vraies | vote-phase 2/2 (RED vu), format 2/2, web 16/16 ; e2e 19/19 (libellé du lien résultats mis à jour : « en direct » retiré, 7.11-b) |
| `34fb3d5` | D5 cartes candidats sans animation ni survol nécessaire, initiales sur `--event-accent-strong` | typecheck, lint 43 |
| `2b50f03` | API additive : `startsAt`/`endsAt` dans les payloads publics profil et résultats | votes.service 14/14 (RED à la compilation) |

**Hypothèse D9-photo** : les trois fichiers de `public/slider` sont des images générées (1024×1024 carré, rendu photoréaliste pour `contest-night`, illustrations pour les deux autres). Hero en aplat `bg-slate-900`, aucune photo.

| `e84333b` | D6 profil + paiement (total en premier, pastilles 2×2, numéro gardé au réessai, message de phase hors fenêtre) ; hook de paiement et payload inchangés | typecheck, lint 42, web 16/16 ; e2e 19/19 |
| `4a291d2` | D7 résultats (voix seules) + D8 billets (bandeau fermé, prix formatés) | idem |
| `5eb7679` `597e44b` | D9 pages d'auth sur fond neutre, carte opaque ; modale plate (`max-h-[90dvh]`), offre Escrow seule (e2e `auth-otp-offers` vérifie désormais Escrow présent / External absent) | e2e 19/19 |
| `3d93bb9` | D10 `/pricing` = « Comment l'argent est séparé » ; CGU : vote confirmé non recrédité, retraits manuels ; centre de cookies en i18n | — |
| `a432469` | i18n des pages d'auth | `isEn ?` 1 169 → 1 030 |

## Consignes utilisateur reçues en cours de lot (2026-10-25)
1. **Mini-plateformes = 3 pages** (candidats, profil, résultats) **d'après la maquette `3 · Résultats-html.zip`** (racine du dépôt), uniformes par défaut.
2. **Adapter les composants existants, ne pas en recréer** ; polices (Inter / Plus Jakarta Sans) et formes (`rounded-md`) de la plateforme, pas Montserrat. Cette consigne prime sur 7.11-b (en-tête en aplat de couleur) : l'en-tête est désormais blanc, nav en capitales espacées, filet d'accent sous l'onglet actif, pied à fond encre.
3. **Photos : import de fichier uniquement, jamais de lien saisi.**

| Commit | Sujet | Preuve |
|---|---|---|
| `209bc81` `7ac1bdb` `ee66bfb` | Mini-plateformes selon la maquette (shell, en-tête, pied, hub, profil, résultats, cartes candidats GRID/LIST/SPOTLIGHT), une seule couleur d'action dans la carte de paiement, pied du site masqué sur `/e/*`, « voix » invariable | captures `docs/validation/{390,1280}/` (5 palettes) regardées ; e2e public 2/2 |
| `a480772` | `ImageUploadField` sans champ URL (import seul, « Retirer la photo ») ; logo de création d'événement en import | typecheck, lint |
| `a28c913` | **Bug vérité métier (P1)** : le hub et le profil comptaient les lignes de vote, pas les voix (`votesCount`) — un paiement de 5 voix affichait 1 | votes.service 15/15 (**RED vu** : 2 au lieu de 7) |
| `bfa4668` `8907a1e` | M5 partage votant : copier, WhatsApp (`wa.me`), partage natif | — |

## Lot E — en cours
| Commit | Sujet | Preuve |
|---|---|---|
| `9611129` | API wallet additive : `commissionCfa`, `byEvent` (brut, commission, réserve, crédité au disponible), `ledgerUnknownEntries`, calculés depuis le journal signé | test:offers 36/36 (RED à la compilation) |
| `5bab678` | E1 navigation (ordre 7.6, recherche dans le header, « Démarrer » masqué, actif `bg-accent`) | — |
| `5354c83` | E2 « Aujourd'hui » : disponible en `text-4xl`, réserve et événements actifs en texte, ligne d'action, liste de 5 | — |
| `6a8c37a` | E5 portefeuille 60/40, commission et tableau par événement depuis l'API | — |

### Constats ouverts
- P3 : la fiche utilisateur admin compte des transactions de vote, pas des voix (`admin.service.ts` ~l.627).
- `pub.votesCount` EN reste « {count} votes » (« 1 votes »).

## Suite des lots E, F, M, G, H (2026-10-25)

| Commit | Sujet | Preuve |
|---|---|---|
| `c732d43` | E6 compte : « Télécharger mes données » (`/privacy/export`) ; suppression = demande à SHADOMA (pas de bouton d'anonymisation immédiate : un propriétaire perdrait l'accès à un portefeuille qui peut contenir de l'argent) | typecheck |
| `0fefad5` | E4 aperçu photo au format 3:4 + rappel du recadrage | — |
| `1dc350f` | M3 API : `null` efface slogan / logo / couleur (deux schémas), refus pour un autre organisateur | events 9/9 (**RED vu** : ZodError) |
| `ffd09f2` | M4 éditeur d'apparence (échantillon mini-plateforme, contraste, pastilles 44 px libellées, `null` envoyé, slogan 2–80 + compteur, aperçu « version enregistrée » 390 px / ordinateur, bouton collant, garde « non enregistré », i18n) ; `dominantColorFromPixels` pure et testée ; `labelEn` ; « Ardoise » | brand 11/11 (**RED vu**) |
| `27534bd` `6ecd5eb` | F1 route `admin/offers/ledger-reconciliation` + vue d'ensemble (retraits à traiter en dominant, journal, maintenance, paiements) | ledger-consistency +1 (RED à la compilation) |
| `78051c4` | F3 commission vide refusée, 0 % confirmé ; F4 déjà conforme (Hérité replié, « Déprécié ») | — |
| `eefb59b` | G1/G2 `cloudinaryTransform` unique, `ogImageUrl`, carte de partage typographique `/e/{slug}/og`, métadonnées hub/profil | og-image-url 4/4 (RED vu) |
| `18a96d1` | G3 manifest minimal ; G4 First Load `/` 573 → 289 kB | `next start` : manifest, icon.svg, og.png 200 |
| `28d7125` | H1 e2e phase (à venir, terminé, ouvert) + billetterie fermée | 4/4 |
| `d0a5996` | H4 CI : `test:offers` reçoit `DATABASE_URL` ; tous les `*.test.ts` API sont listés | — |

E3 (création/édition d'événement en une colonne) : **non traité** au-delà du logo en import ; la page garde sa structure actuelle.

## Passe design finale (2026-10-25)

| Commit | Sujet |
|---|---|
| `a53c400` `1639b2b` | Composants partagés sans verre (`Card`, `GlassCard`, header dashboard), `rounded-md` ; sur-titres en casse normale (13 fichiers) |
| `cc451ae` | `DESIGN.md` du projet : principes, tokens, disposition des mini-plateformes, mouvement, états, langue, images |
| `fe68635` `22e2c2c` `283a49d` | Correctifs trouvés sur les captures 390 px : headers dashboard et admin, bandeau Escrow faux, compteur d'étapes, numéro de retrait, `fieldset` qui élargissait les cartes |

Validation visuelle détaillée : `docs/validation/RAPPORT.md` (captures dans `docs/validation/{390,1280}/`).

# RAPPORT FINAL

## 1. Verdict : **GO CONDITIONNEL**

Démontré par le code et les tests : intégrité financière du portefeuille (journal signé, transitions de retrait atomiques, réconciliation exposée à l'admin), funnel de vote non régressé (hook de paiement et payloads inchangés, e2e verts), billetterie honnête (fermée côté API et interface), isolation multi-tenant testée sur les nouveaux chemins (événements, portefeuille). Non démontrable par le code : un paiement réel de bout en bout chez un PSP — d'où « conditionnel ».

## 2. État Git
Branche `chore/finalisation-shadoma`, 66 commits depuis `main` @ `6d2bda5`, **jamais poussée**. Hors `package-lock.json` : 153 fichiers, +6 076 / −3 142 lignes.

## 3. Constats majeurs (tous corrigés, avec test)
| Prio | Constat | Correctif |
|---|---|---|
| P0 | Aucun écran pour le numéro de retrait : aucun retrait possible | `558fe1d` |
| P0 | Double restitution d'un retrait rejeté en concurrence | `a6790e8` (RED vu) |
| P1 | Billetterie créant des billets jamais payés | `75c7fca` |
| P1 | Journal wallet sans sens : réconciliation impossible | Lot L (ADR-021, RED vu) |
| P1 | Hub et profil comptaient les lignes de vote, pas les voix payées | `a28c913` (RED vu) |
| P1 | OTP non envoyé en production sans erreur ; chatbot sans plafond | Lot B |
| P2 | Prompt du chatbot promettant des choses fausses (adresse inventée…) | `048a934` |
| P2 | CI : `test:offers` sans `DATABASE_URL` | `d0a5996` |

## 4. Résultats des commandes (état final)
| Commande | Baseline | Final |
|---|---|---|
| API `npm test` | 229/230 | **258/258** |
| `test:offers` | 31/32 | **36/36** |
| Web `npm test` | non lancé | **23/23** |
| e2e Playwright | non lancé | **23/23** (19 historiques + 4 phase/billetterie) |
| Typecheck web / API | 0 / 0 | 0 / 0 |
| Lint web | 43 warnings | **42** warnings, 0 erreur |
| First Load `/` | 573 kB | **289 kB** |
| `isEn ?` (lignes, `grep -c`) | 1 180 | 978 |

## 5. Restant (priorisé)
1. Captures à refaire après les deux derniers correctifs de header/fieldset ; regarder compte, maintenance et les palettes non regardées.
2. i18n : ~978 ternaires `isEn ?` restent, surtout en admin et dans le designer de billets.
3. Fiche utilisateur admin : compte des transactions, pas des voix (P3).
4. Édition d'un événement existant (`/events/[id]/edit`) pas encore passée en une colonne.

## 6. Checklist de préproduction (humaine)
- Clés PSP de production et **un paiement réel de bout en bout** (vote → confirmation serveur → crédit wallet → réconciliation à 0 écart).
- `MAIL_RESEND_API_KEY` + domaine d'envoi vérifié ; OTP reçu.
- Secrets régénérés (JWT, organisateur, vault, cron, ops) ; mot de passe admin du seed changé.
- API toujours active, `API_BASE_URL`, proxy `/api/v1` ; worker cron déployé avec ses secrets.
- `prisma migrate deploy` (40 migrations) puis compter les lignes de journal inconnues ; sauvegardes et test de restauration.
- Cloudinary configuré (sinon l'import de photos est indisponible, message affiché) ; CSP passée en bloquant après 7 jours sans violation.
- **Adresse de contact réelle sur la page Mentions légales** (aucune aujourd'hui).
- CGU et confidentialité relues par une personne compétente ; logo SHADOMA définitif ; runbook du virement manuel.


## Suite — mini-plateformes configurables (2026-10-25)

Demande : pages d'événement personnalisables par l'organisateur (logo, branding), trois pistes de design reprises, police plus festive.

- Données (additif) : `Event.coverUrl`, `Event.pageStyle` (`AFFICHE` par défaut, `SOIREE`, `BILLET`), `Event.fontStyle` (`FESTIVAL` par défaut, `GALA`, `CLASSIQUE`) — migration `20261025180000_event_page_style`, validés à la création et à la modification, exposés dans le `branding` des trois réponses publiques. Test d'intégration ajouté (RED vu à la compilation, puis GREEN).
- Éditeur d'apparence : choix du style (vignettes), import de la couverture, choix de la police avec aperçu du titre.
- Pages `/e/*` : bandeau par style (`components/event-hero.tsx`), compte à rebours depuis la date stockée (`components/vote-countdown.tsx`, `lib/minisite-style.ts` testé), cartes par style, jetons `--mini-*` dans `globals.css`, accent éclairci pour la Soirée (`deriveAccentBright`, testé sur 500+ couleurs). La carte de paiement reste claire et opaque dans tous les styles ; payloads de vote et de paiement inchangés.
- Polices : Unbounded et Playfair Display auto-hébergées (OFL), non préchargées.
- Portes : API 259/259, offres 36/36, web 30/30, e2e 23/23, typecheck 0, lint web 0 erreur / 42 avertissements, lint API 0, build OK. Captures : `docs/validation/RAPPORT.md`.
- À faire côté dev local : appliquer la migration sur la base de développement (`npx prisma migrate deploy` dans `packages/db`) avant de lancer l'application.

## Suite — six modèles, partage, import sans serveur (2026-10-25)

- Trois styles de plus : `COURONNE`, `MAGAZINE`, `POP` (migration additive `20261025200000_event_page_style_more`). Fond teinté par la couleur de l'événement ; bande de couverture sur les pages profil et résultats en Affiche.
- Partage : `ShareSheet` remplace les boutons « Copier le lien » (votant et organisateur) ; logos officiels Simple Icons (CC0) dans `lib/brand-icons.ts` ; `lib/share-targets.ts` testé.
- Import d'images sans Cloudinary dans tous les environnements : stockage en base (`StoredImage`, migration `20261025210000_stored_image`), type vérifié par signature binaire, SVG refusé, servi avec `nosniff` et cache immuable ; réduction à 1 600 px dans le navigateur. Le test « 503 hors développement » est remplacé par les tests du nouveau comportement (demande explicite). `logoUrl` accepte désormais les chemins d'images stockées (test ajouté, RED vu).
- Portes : API 261/261, offres 36/36, web 36/36, e2e 23/23, typecheck 0, lint web 0 erreur / 42 avertissements, lint API 0.
- Base de dev locale : appliquer les migrations (`npx prisma migrate deploy` dans `packages/db`).

## Suite — dix styles, fond image ou couleur, modèles par type d'événement (2026-10-25)

- Styles `TERROIR`, `STADE`, `LINEUP`, `DIPLOME` et champ `Event.heroBackground` (`IMAGE` par défaut, `COLOR`) — migration additive `20261025220000_event_templates_background`, test d'API (RED vu, puis GREEN).
- La couverture passe derrière les bandeaux de tous les styles (voile à la couleur de l'événement), sauf choix « couleur unie ».
- Seize modèles prêts à l'emploi par type d'événement (`lib/event-presets.ts`, testé) dans l'éditeur d'apparence.
- Portes : API 261/261, offres 36/36, web 39/39, e2e 23/23, typecheck 0, lint web 0 erreur / 42 avertissements, lint API 0.

## Suite — dix-sept styles, 78 modèles en huit familles (2026-10-25)

- Styles `MARCHE`, `MENU`, `WAX`, `CAMPUS`, `BADGE`, `STORY`, `SANCTUAIRE` — migration additive `20261025230000_event_page_styles_more` ; bandeau, cartes candidats (Menu : liste de plats), vignette de l'éditeur, jetons CSS. `isNightStyle` regroupe les styles à fond nuit.
- 78 modèles en huit familles (`EVENT_PRESET_CATEGORIES`), recherche sans accents FR/EN (`filterPresets`), testés : combinaisons style + police + couleur uniques.
- Captures : `VISUAL_PALETTES=a,b` limite `tests/visual/minisite.spec.ts` à certaines palettes ; `E2E_WEB_PORT` change le port du site de test (3100 par défaut).
- Finition : étiquette Marché (nom puis numéro, plus de coupure en plein mot à 390 px) ; mouvement réduit respecté sur les cartes candidats.
- Accessibilité : spec e2e `a11y-minisite.spec.ts` (axe WCAG 2.2 A/AA + défilement horizontal, 17 styles × 3 pages à 390 px + éditeur). Premier passage : 44 violations ; toutes corrigées (`--event-accent-ink` / `deriveAccentInk`, `--color-muted-foreground` → slate-600, sélecteur de langue, numéro Magazine, `<dl>` Affiche, aperçu de l'éditeur). Détail : `docs/validation/RAPPORT.md`.
- Dépendances (npm audit, production) : 3 critiques + 13 hautes → 0 critique + 5 hautes. `next` 15.5.28, `@sentry/nextjs` 10.76.2, `proxy-addr` 2.0.8, overrides `multer` 2.5.0, `sharp` 0.35.5, `postcss` 8.5.31. Restent : `zod` 3 (correctif = zod 4, majeur ; corps JSON limités à 100 ko + throttling), `prisma` 6 / `deepmerge-ts` (CLI de migration, correctif = Prisma 7), `postcss` 8.4.31 interne à `next` (build seulement).
- Portes : API 261/261, offres 36/36, web 44/44, e2e 24/24 (dont accessibilité), typecheck 0, lint web 0 erreur / 42 avertissements, lint API 0.
- e2e : si le port 3100 est pris par une autre application, `E2E_WEB_PORT=3110`. Base de test du conteneur local : `TEST_DATABASE_URL` avec les identifiants de `DATABASE_URL` (`.env`) et la base `votezpro_test`.

