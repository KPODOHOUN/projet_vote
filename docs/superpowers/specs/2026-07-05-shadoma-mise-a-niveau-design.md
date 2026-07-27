# Spec — Mise à niveau SHADOMA (parité stratégique vs Keevent)

- **Date** : 2026-07-05
- **Statut** : validé (brainstorming), prêt pour plan d'implémentation
- **Périmètre choisi** : parité stratégique + billetterie légère
- **Contexte concurrentiel** : Keevent (Conakry) = plateforme événementielle généraliste
  (billetterie QR + scan mobile online/offline, votes payants « 1/IP », cagnottes,
  marketplace prestataires, découverte publique, ~14 pays / multi-devise, app native).
  SHADOMA = SaaS de vote payant profond (anti-fraude payé-only + téléphone hashé,
  payouts multi-PSP, commissions 3 niveaux, white-label par event, RGPD, multi-tenant durci).

## 1. Objectif

Combler **3 manques à fort ROI** face à Keevent **sans** diluer le fossé de SHADOMA
(le vote monétisé sécurisé). On ne devient pas un événementiel généraliste.

Explicitement **hors scope** : marketplace prestataires, communauté/social, cagnottes/dons,
app native (store), agrégateur multi-pays (type CinetPay), encaissement multi-devise réel
(FX / charge en devise étrangère).

## 2. Principe directeur

On protège et on étend la verticale vote. Toute nouveauté réutilise les seams existants
(PSP registry, verify-by-pull ADR-017, tests DB réels, E2E Playwright, discipline PII/hash).

## 3. État du code pertinent (vérifié)

- Montants stockés en `Int` suffixés `...Cfa` (`Vote.amountCfa`, `Event.voteUnitPriceCfa`,
  `PaymentTransaction.amountCfa`, `Payout.amountCfa`, `ActivationDebt.amountCfa`,
  `VaultEntry.amountCfa`…). La plus petite unité XOF = 1 franc (0 décimale).
- Devise **codée en dur** : `@default("XOF")` sur `PaymentTransaction` et `Payout` ;
  ailleurs la devise est implicite (nom de colonne `Cfa`).
- **Aucun** modèle billet (`Ticket`/`TicketType` = net new).
- **Aucun** champ de visibilité publique sur `Event`.
- Paiement public : `POST /payments/public/init`, `POST /payments/public/status`,
  `GET /payments/public/status/stream` (SSE), webhook FeexPay ; registry multi-PSP.
- Public vote read : `GET /votes/public/:tenantSlug/events[/:eventSlug]`.

## 4. Chantiers

### Chantier 1 — Annuaire public de découverte (opt-in)

**But** : canal d'acquisition entrant (SEO/découverte) que Keevent a et que SHADOMA n'a pas.

**Data**
- `Event.publicListed Boolean @default(false)`
- `Event.publicListedAt DateTime?` (posé au passage `true`, pour tri/audit)

**API**
- `GET /api/v1/votes/public/discover`
  - Cross-tenant ; renvoie uniquement `status = ACTIVE AND publicListed = true`.
  - Query : `q` (recherche titre/slogan), `sort` (`recent` | `popular`), `page`, `pageSize`.
  - `popular` = tri par volume de **votes payés** (SUCCEEDED), réutilise la logique de tally.
  - Projection **whitelistée** : slug, titre, slogan, brandColor, logoUrl, nb candidats,
    (option) compteur de votes agrégé. **Jamais** de PII votant, montants internes,
    identifiants tenant sensibles.

**Web**
- Route publique `/explore` : grille de cartes-events (brand par event), lien `/e/{slug}`.
- SEO : `sitemap.xml` dynamique (events listés) + metadata OpenGraph par event.

**Organisateur**
- Toggle « Lister publiquement dans l'annuaire » : formulaire création + `edit`.
- Défaut **privé** (respecte le white-label ; pas d'exposition sans consentement).

**Isolation** : `discover` est le seul endpoint cross-tenant public ; lecture des seules
colonnes whitelistées ; pas de fuite d'événements non-`ACTIVE` ou non listés.

**Tests**
- DB réelle : un event listé apparaît, un event privé/`DRAFT` n'apparaît pas ; tri popular
  respecte les votes payés ; pas de PII dans la réponse.
- E2E : toggle organisateur → présence sur `/explore` → clic → `/e/{slug}`.

### Chantier 2 — Multi-devise « display » (fondation)

**But** : préparer l'expansion géographique **sans** changer les PSP (V1 encaisse toujours XOF).

**Data**
- Ajouter `currency String @default("XOF")` là où la devise est implicite : au minimum
  `Event` (devise de l'event, source de vérité pour ses prix), et sur les entités de montant
  dérivées si nécessaire pour l'historique (`Vote`, `ActivationDebt`, `VaultEntry`).
- **Ne pas renommer** les colonnes `amountCfa` (risque migration). On les traite comme
  « montant entier en plus petite unité » (`amountMinor`) ; le nom devient un legacy toléré.

**Shared**
- Value object `Money { amountMinor: number; currency: string }`.
- `formatMoney(money, locale?)` : formatage via `Intl.NumberFormat`, exposant par devise
  (table `currencyExponent`, XOF = 0). SSOT du formatage monétaire.
- `currencyExponent(currency)` : util pour convertir minor ↔ major à l'affichage.

**Frontend**
- Tout affichage de prix passe par `formatMoney()` ; la devise vient de l'event/tenant.
- Suppression des « FCFA »/« CFA » codés en dur dans l'UI.

**Hors scope V1** : nouveaux PSP/pays, conversion FX, encaissement en devise ≠ XOF.
On **modélise et on affiche** ; on **n'encaisse** encore qu'en XOF (validation : devise
event = XOF requise à l'init paiement tant qu'aucun PSP non-XOF n'est branché).

**Tests**
- Unitaires `formatMoney` (XOF 0 décimale ; une devise à 2 décimales pour prouver l'exposant).
- DB : un event porte une `currency` ; l'init paiement refuse une devise non encaissable.

### Chantier 3 — Billetterie légère + PWA de scan

**But** : retenir les organisateurs de galas/concours pour l'entrée physique (parité Keevent).

**Data**
- `TicketType` (FK `Event`) : `name`, `priceMinor Int`, `currency String`, `quota Int?`,
  `salesStart DateTime?`, `salesEnd DateTime?`.
- `Ticket` : `id`, FK `ticketTypeId` (+ `eventId` dénormalisé pour scan), `buyerName`,
  `buyerEmail`, `buyerPhoneHash` + `buyerPhoneLast4` (cohérent avec la politique PII vote),
  `token String @unique` (opaque ; sert d'identifiant scanné), `status` (`ISSUED` |
  `CHECKED_IN` | `VOID`), `checkedInAt DateTime?`, `checkedInBy String?`,
  `paymentTransactionId` (lien émission↔paiement).

**Émission** (réutilise le seam paiement)
- Achat via `payments/public/init` + verify-by-pull (ADR-017) + PSP registry.
- Un ticket passe `ISSUED` **uniquement** après paiement `SUCCEEDED` (même discipline que
  les votes payés ; pas de billet gratuit non honoré).
- Quota décrémenté de façon transactionnelle à l'émission (pas de survente).

**Livraison**
- QR = `token` **HMAC-signé** (payload `ticketId|eventId`, secret de scan par event, rotation
  courte). Envoi email + section « Mes billets » côté acheteur.

**PWA de scan** (route web install-able `/scan`)
- Caméra + décodage QR.
- **Validation offline** : la signature HMAC est vérifiable hors-ligne avec la clé de scan
  de l'event (chargée à l'ouverture de session de scan) → verdict immédiat sans réseau.
- File **IndexedDB** des check-ins hors-ligne + **sync** à la reconnexion.
- **Single-scan** : le serveur est l'autorité (premier check-in gagne) ; l'offline détecte
  les doublons localement et réconcilie au sync (`409 already_checked_in`).
- Endpoint `POST /api/v1/tickets/scan` : valide token + signature + unicité serveur ;
  retourne verdict (`ok` | `already_checked_in` | `invalid` | `wrong_event`).

**Anti-fraude** : QR non forgeable (signature serveur) + unicité serveur ; aucun billet
émis sans paiement confirmé.

**Sécurité / isolation** : la clé de scan est scoppée à l'event ; un scanner ne peut valider
que les tickets de son event (`wrong_event`) ; RBAC sur l'ouverture de session de scan.

**Tests**
- DB : émission gated paiement ; quota anti-survente ; single-scan (2ᵉ scan = 409) ;
  wrong_event refusé ; token invalide/altéré refusé.
- E2E : achat billet (paiement simulé) → réception token → scan `/scan` → `CHECKED_IN` →
  re-scan refusé ; scénario offline (queue + sync).

## 5. Séquencement

1. **Chantier 1 (Annuaire)** — isolé, livrable vite, acquisition immédiate.
2. **Chantier 2 (Multi-devise)** — fondation ; précède la billetterie pour que les prix
   billets soient multi-devise dès le départ.
3. **Chantier 3 (Billetterie + PWA)** — dépend de 1 (découverte) et 2 (money).

Chaque chantier : spec → plan → implémentation indépendants, testables séparément, dans la
discipline actuelle (tests contre `votezpro_test`, E2E Playwright, migrations Prisma).

## 6. Critères de succès

- **C1** : un organisateur peut rendre son event public ; il apparaît sur `/explore` et dans
  le sitemap ; aucun event privé/non-ACTIVE n'y figure ; aucune PII exposée.
- **C2** : tous les prix affichés passent par `formatMoney` ; un event porte une devise ;
  l'init paiement en devise non encaissable est refusé ; aucune régression sur les montants XOF.
- **C3** : un billet payant s'achète, se livre en QR signé, se scanne une seule fois (online
  et offline+sync), et ne peut être ni forgé ni émis sans paiement.
- **Transversal** : zéro régression sur vote payé-only, hash téléphone, payouts, commissions,
  isolation tenant ; suites DB + E2E vertes.

## 7. Hors scope (rappel)

Marketplace prestataires, communauté/social, cagnottes/dons, app native store, agrégateur
multi-pays, encaissement multi-devise réel (FX). À réévaluer après cette mise à niveau.
