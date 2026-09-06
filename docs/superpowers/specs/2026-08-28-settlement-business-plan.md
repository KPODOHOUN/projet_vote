# SHADOMA Votes — Business plan settlement & finance organisateur

**Date :** 2026-08-28  
**Statut :** Proposition validée en discussion (à implémenter)  
**Remplace / complète :** ADR-019 (offres EXTERNAL/ESCROW), logique retenue clôture seule  
**Périmètre :** Offre Escrow active (bêta et prod). Offre External reste parkée.

---

## 1. Résumé exécutif

SHADOMA Votes encaisse des votes payants Mobile Money (XOF) pour le compte d’organisateurs d’événements. Le nouveau modèle financier vise trois objectifs simultanés :

1. **Sécurité plateforme** — jamais payer plus que l’encaissement vérifié moins commission et réserve.
2. **Flexibilité organisateur** — visibilité temps réel, retraits partiels pendant l’événement.
3. **Rentabilité** — commission par vote (taux standard + override admin) + marge ops sur le tier Standard.

**Principe fondateur :** la commission plateforme est **irréversible** dès confirmation PSP ; les retraits ne puisent que dans le solde **retirable**, jamais dans la commission ni dans la réserve tant qu’elle n’est pas libérée.

---

## 2. Offres produit (2 tiers)

### Tier 1 — Standard (défaut bêta)

| Élément | Règle |
|---------|--------|
| Encaissement votes | Compte marchand **plateforme** (clé API SHADOMA) |
| Configuration orga | Aucune clé PSP requise |
| Commission | Par vote — **taux standard plateforme** (défaut) ou **override admin** par event / tenant (voir §5) |
| Retraits | **Manuels** (workflow admin) — **seul mode actif en bêta** |
| Sortie des fonds | Virement Mobile Money manuel ops → `mark-paid` |
| Tarification | Taux standard unique ; override admin possible sur devis (voir §5.5) |

### Tier 2 — Pro (clé organisateur + PSP payout)

| Élément | Règle |
|---------|--------|
| Encaissement votes | Clé API **organisateur** ou **événement** |
| Commission | Même logique par vote ; split PSP natif si disponible (FedaPay), sinon ledger |
| Retraits | **Automatiques** via PSP payout — **désactivé jusqu’à validation sandbox** (voir §6.1) |
| Tarification | Taux standard −2 pts vs Standard ; override admin possible |
| Prérequis | Clé PSP validée + destination retrait configurée + palier de confiance **Trusted** (voir §7) |

**Règle produit :** Tier 2 n’est proposé qu’après validation split/commission ou compte établi. **Le retrait auto PSP ne s’active en production qu’après campagne de tests réussie** (§6.1) — bêta et prod initiale = **100 % manuel** pour Standard et Pro.

---

## 3. Structure du portefeuille (4 poches)

Chaque tenant Escrow possède un `OrganizerWallet` avec soldes **explicites** côté orga et admin.

| Poche interne | Affichage orga | Retirable | Alimentation |
|---------------|----------------|-----------|--------------|
| `commissionCfa` (plateforme) | Info / masqué orga | Non | Prélevée à chaque vote `SUCCEEDED` |
| `heldCfa` | **« Réserve de sécurité »** | Non (jusqu’à libération) | % du net vote selon palier de confiance (§7) |
| `withdrawableCfa` | **« Disponible au retrait »** | Oui | Reste du net vote + libération held |
| *(info)* `grossCfa` | « Encaissé (brut) » par event | Non | Somme des paiements confirmés |

**Migration depuis l’existant :**

- `pendingCfa` actuel → scindé en `heldCfa` + `withdrawableCfa` à chaque crédit vote.
- `availableCfa` actuel → renommé conceptuellement `withdrawableCfa` (solde global retirable).
- **Suppression** de la retenue supplémentaire à la clôture (5 % `offer2_retention_bps`) lorsque la commission par vote est active — **une seule commission**, pas deux.

---

## 4. Flux linéaire — organisateur

### Phase A — Onboarding

1. Inscription → offre **Escrow / Tier Standard** par défaut.
2. Affichage des règles financières : **taux commission applicable à cet event** (standard ou override admin), réserve %, plafond retrait mid-event.
3. *(Optionnel Tier Pro)* Configuration clé PSP + `POST /organizer/payout-destination`.

### Phase B — Événement actif

4. Activation de l’événement → votes publics.
5. Chaque vote `SUCCEEDED` (verify-by-pull PSP) :
   ```
   brut           = montant vote
   commission     = floor(brut × commission_bps / 10_000)  → plateforme (irréversible)
   net            = brut − commission
   held           = floor(net × held_bps / 10_000)         → réserve visible
   withdrawable   = net − held                             → retirable (sous plafonds)
   ```
6. **Orga** (`/dashboard/events/[id]`) et **admin** (`/admin/offers/events`) voient :
   - `totalCollectedCfa`, `platformCommissionCfa`, `organizerNetCfa`
   - par event : `heldCfa`, `withdrawableCfa`, date libération prévue.

### Phase C — Retrait (y compris mid-event)

7. Orga demande retrait sur `/dashboard/wallet` : `montant ≤ withdrawableCfa` et ≤ plafonds.
8. Débit **immédiat** de `withdrawableCfa` + création `WithdrawalRequest`.
9. **Tous les retraits (bêta + prod initiale)** → `PENDING` → admin `APPROVE` → `mark-paid` (virement MoMo manuel ou démo).
10. **Retrait auto PSP (Tier Pro)** — *hors scope jusqu’à gate §6.1* → appel PSP payout → `IN_FLIGHT` → `PAID` / `FAILED` (recrédit si échec).

### Phase D — Clôture & libération réserve

11. Clôture événement (manuelle ou cron `endsAt`) → statut `CLOSED`.
12. Délai sécurité **48 h** (anti-litige PSP).
13. `heldCfa` de l’event → crédit `withdrawableCfa` + notification orga.
14. Message : *« Votre réserve de X XOF est maintenant disponible au retrait. »*

---

## 5. Commission — taux standard & override admin

**Décision (2026-09-05) :** pas de grille automatique basée sur un volume déclaré par l’organisateur — ce volume n’est ni vérifiable ni vérifié avant l’event, ce qui aurait permis de sur-déclarer pour obtenir un taux et une réserve plus bas sans conséquence (aucune remontée rétroactive prévue). Le taux **standard** s’applique par défaut à tout le monde ; toute exception passe par un **override admin explicite et audité**, jamais par une auto-évaluation du volume.

La commission reste **figée par event** dès l’activation — l’organisateur voit le taux avant le premier vote ; il ne change pas en cours de concours sauf nouvel event.

### 5.1 Taux standard (défaut)

- Un taux unique par tier, configuré plateforme (`offer2_per_vote_commission_bps_standard` / `_pro`), appliqué à tout organisateur qui n’a pas d’override.
- Pas de palier basé sur un GMV prévisionnel ou déclaré : le taux ne dépend ni de la taille annoncée de l’event, ni d’une auto-évaluation organisateur.
- La réserve `held` ne dépend **que** du palier de confiance (§7), jamais d’un volume déclaré.

### 5.2 Override admin (event ou tenant)

L’admin peut **surcharger** le taux standard pour un event ou un organisateur, sur devis (partenariat, gros volume réel constaté a posteriori, cas stratégique) :

| Niveau | Champ | Priorité résolution | Expiration |
|--------|-------|---------------------|------------|
| **Event** | `Event.commissionBps` | 1 — taux négocié pour ce concours | Automatique — bornée par `Event.endsAt`/`closedAt`, déjà fixés à la création de l’event ; pas de champ de validité supplémentaire à créer |
| **Organisateur** | `Tenant.commissionBps` | 2 — accord cadre multi-events | Aucune — s’applique à tout event futur du tenant jusqu’à modification explicite par un admin ; ne s’applique jamais rétroactivement à un event déjà activé |
| **Plateforme** | `offer2_per_vote_commission_bps_standard` / `_pro` | 3 — fallback global (taux standard, une valeur par tier — cf. §5.1) | N/A |

Chaîne déjà partiellement implémentée dans `payment-verify.service.ts` (event → tenant → platform) ; aucun endpoint admin n’écrit encore ces champs pour l’escrow (`Event.commissionBps` / `Tenant.commissionBps` — à livrer F1/F2, cf. écart implémentation §11).

### 5.3 Workflow override

1. Orga crée l’event → taux standard appliqué par défaut, affiché avant activation.
2. Orga peut **demander un devis** (bouton « Négocier la commission ») à tout moment — pas de seuil de volume auto-déclaré déclenchant le bouton ; c’est une demande manuelle traitée au cas par cas par l’admin. *(Si l’event courant est déjà activé, l’override ne s’y applique pas — gel total §5.5 — il ne s’applique qu’aux events futurs.)*
3. Admin fixe `commissionBps` sur l’event ou le tenant → notification orga avec taux **garanti**.
4. À l’**activation** : `commissionBps` (standard ou override) est **gelé** sur l’event (snapshot) ; affiché sur fiche event + CGU event. **`heldBps` est gelé de la même manière** (voir §7 — nécessite un nouveau champ `Event.heldBps`, contrairement à `commissionBps` qui est déjà admin-writable). **Exception de sécurité :** si un **incident** (§7) survient sur un autre event du même tenant pendant que cet event est actif, le `heldBps` repasse immédiatement au palier **Nouveau** (50 %) pour **tous** les events actifs de ce tenant (une seule requête `UPDATE ... WHERE tenantId AND status=ACTIVE`), puis se regèle à nouveau à cette valeur — l’organisation **prévisible pour l’orga**, la **sécurité pour la plateforme**.
5. Chaque vote applique ce taux ; `commissionCfa` stocké sur `PaymentTransaction` (immuable).

### 5.4 Transparence organisateur

Avant activation, l’orga voit son taux effectif, par exemple :

```
Commission SHADOMA  : 8 % (taux standard)
Net organisateur    : 92 % du montant collecté (hors réserve held)
```

Si taux négocié : badge **« Tarif négocié »** + niveau (event ou accord cadre tenant).

### 5.5 Garde-fous plateforme sur l’override

- **Tout override — event ou tenant — reste entre 4 % (plancher) et 12 % (plafond).** Sortir de cette fourchette, dans un sens comme dans l’autre, est bloqué à l’écriture sauf rôle **`PLATFORM_SUPER_ADMIN`** explicite (rôle qui existe déjà dans le schéma — pas un admin standard) : le plancher protège la marge plateforme, le plafond protège l’organisateur contre une surtarification abusive. Même mécanisme des deux côtés.
- Tout override (event ou tenant), y compris hors fourchette, écrit une entrée d’audit obligatoire : ancien taux, nouveau taux, admin auteur, portée (event/tenant), motif — pas de champ optionnel.
- Un event **déjà activé** : changement de taux **interdit** — gel total dès l’activation (aucune exception).
- Un override tenant ne s’applique jamais à un event déjà activé, seulement aux events futurs.

---

## 6. Grille opérationnelle (held, retraits, délais)

### 6.1 Retrait auto — politique « test d’abord »

**Décision :** le payout PSP automatique sur demande de retrait **n’est pas activé en production** tant que la chaîne complète n’a pas été validée en environnement contrôlé.

| Environnement | Mode retrait | Flag |
|---------------|--------------|------|
| **Bêta / prod initiale** | **100 % manuel** (admin approve + mark-paid) | `withdrawal_auto_psp_enabled=false` |
| **Staging / sandbox PSP** | Auto activé pour comptes pilotes uniquement | `withdrawal_auto_psp_enabled=true` (staging only) |
| **Production** | Auto uniquement après checklist verte + GO ops | flag admin + feature tenant |

**Checklist avant activation prod du retrait auto :**

1. Payout sandbox PSP : succès, échec, timeout, montant incorrect → recrédit wallet OK.
2. Verify-by-pull sur statut payout (même pattern que payin ADR-017).
3. Idempotence : double clic retrait / retry réseau → un seul débit.
4. Plafonds journaliers et palier de confiance respectés côté serveur.
5. e2e staging : demande retrait → `IN_FLIGHT` → `PAID` sans intervention admin.
6. Runbook incident : payout `UNCERTAIN` / `FAILED` documenté.
7. Validation ops : virement réel sur 2–3 montants pilotes (hors démo).

**Jusqu’au GO :** même un organisateur Tier Pro avec clé PSP passe par la **file admin** — l’auto est une optimisation, pas un prérequis au lancement bêta.

### 6.2 Paramètres held, retraits, délais

| Paramètre | Tier Standard | Tier Pro | Config admin |
|-----------|---------------|----------|--------------|
| Commission par vote | **Taux standard §5.1** ou override | Taux standard −2 pts ou override | `Event.commissionBps` / `Tenant.commissionBps` |
| Réserve held | Selon palier de confiance (§7) | Idem −5 pts | `settlement_held_bps` |
| Retirable mid-event (cap) | Selon palier de confiance (§7) — identique pour Standard et Pro, pas de cap séparé par tier | Idem | `mid_event_withdrawal_cap_bps` (piloté par palier, pas par tier produit ; portée précisée en §7) |
| Délai 1er retrait | **24 h** après 1er vote | **12 h** | `first_withdrawal_delay_hours` |
| Plafond retrait / jour | **500 000 XOF** | **1 000 000 XOF** | `daily_withdrawal_cap_cfa` |
| Approbation admin | **Toujours** (bêta + prod jusqu’à gate §6.1) | **Toujours** jusqu’à gate ; puis auto si palier **Trusted** | `withdrawal_auto_psp_enabled` |
| Délai libération held post-clôture | **48 h** | **48 h** | `held_release_delay_hours` |

La commission par vote est **activée par défaut** (`offer2_per_vote_commission_enabled = true`). Le taux effectif vient de la **résolution §5.2**, pas d’un pourcentage fixe global.

---

## 7. Palier de confiance organisateur

**Décision (2026-09-05) :** pas de score composite pondéré (le doc précédent citait des signaux — ancienneté, volume, identité — sans formule ni propriétaire). Le palier est calculé sur un **unique compteur vérifiable côté serveur, sans saisie déclarative** : le nombre d’**events clôturés sans incident**.

**Incident** = litige/chargeback confirmé par le PSP sur un paiement de l’event, ou fraude confirmée par un admin (annulation forcée, remboursement votants imposé). Un simple rejet de retrait (ex. pièce manquante) n’est **pas** un incident.

| Palier | Condition | Held | Cap mid-event | Retraits |
|--------|-----------|------|---------------|----------|
| **Nouveau** | 0 event clôturé sans incident, ou incident sur le dernier event | 50 % | 50 % | 100 % manuels |
| **Établi** | 1 à 4 events clôturés sans incident consécutif | 25 % | 75 % | 100 % manuels (bêta) |
| **Trusted** | 5 events clôturés sans incident consécutif | 15 % | 85 % | Manuels ; **auto PSP après gate §6.1** |

**Portée du cap mid-event (règle binaire, pas d’agrégation par event) :** tant que le tenant a **au moins un event ACTIF** (non clôturé), le cap s’applique à **tout** `withdrawableCfa` du wallet, y compris la part déjà libérée d’un autre event clôturé — pas de calcul « part de A vs part de B ». Dès que **tous** les events du tenant sont clôturés, le cap se lève entièrement (seul le plafond journalier §6.2 reste). Plus conservateur que nécessaire dans de rares cas, mais ne demande ni nouveau champ ni requête d’agrégation par event.

**Règles de calcul :**

- Le compteur ne progresse que sur des events dépassant un **volume minimal** (seuil `trust_counter_min_votes_cfa`, config admin). Un event sous ce seuil est **neutre** : il ne fait pas progresser le palier, mais ne casse pas non plus la série d’events « sans incident consécutifs » — il est ignoré, comme s’il n’avait pas eu lieu.
- Un incident **réinitialise le compteur à 0** (retour à Nouveau) — jamais de blocage permanent : l’organisateur peut regagner de la confiance avec de nouveaux events propres.
- Un incident **refige aussitôt le held de tous les events actifs du tenant au palier Nouveau** (50 %), conformément à l’exception de gel §5.3 — la sécurité perdure sur les events encore ouverts, pas seulement sur le compteur.
- **Tout incident, quel que soit le palier du tenant au moment où il survient (premier event ou 10e), déclenche un flag de revue manuelle admin qui bloque la création de tout nouvel event** par ce tenant tant qu’un admin ne lève pas le flag (badge explicite en admin + motif). Règle unique, sans exception liée à l’ancienneté : un compte établi qui casse la confiance après plusieurs events propres est au moins aussi préoccupant qu’un nouveau compte qui rate son premier essai — les deux passent par la même revue avant de pouvoir relancer un event.
- Le signal « identité vérifiée » est retiré : aucune vérification KYC n’existe aujourd’hui dans la plateforme (`apps/api/src`) ; il ne sera réintroduit que si un flux KYC est livré.

**Override admin :** un admin peut forcer le palier d’un tenant (ex. partenaire connu sans historique plateforme) — livré en **F5**, pas laissé en « futur » indéterminé. Toute correction manuelle du palier écrit une entrée d’audit (ancien palier, nouveau palier, motif, admin auteur).

**Affichage orga** (`/dashboard/offer`) : palier actuel, réserve actuelle, progression (« 2 events sans incident sur 5 avant le palier Trusted »).

---

## 8. Anti-fraude & sécurité plateforme

### Invariants techniques (non négociables)

1. Aucun crédit wallet sans `PaymentTransaction.SUCCEEDED` + verify-by-pull.
2. `montant_retrait ≤ withdrawableCfa` (transaction atomique, débit immédiat).
3. Commission jamais débitée du wallet orga au retrait — prélevée à l’entrée.
4. Ledger immuable ; réconciliation quotidienne `wallet = Σ ledger`.
5. `API_PAYMENT_DEMO_MODE` interdit en production.
6. Un seul retrait `PENDING` / `IN_FLIGHT` par tenant (configurable, défaut activé — `single_pending_withdrawal_enabled`).
7. Tout override de commission (event ou tenant) ou de palier de confiance écrit une entrée d’audit immuable — pas d’écriture silencieuse.

### Exposition maximale plateforme

```
perte_max ≈ chargebacks_PSP
            − commission_déjà_gardée
            − held_non_libéré
            − retraits_non_mark_paid
```

Objectif nouveaux comptes : **perte_max → 0** via held 50 % + retraits 100 % manuels + délai 24 h.

### Situations extrêmes

| Situation | Action |
|-----------|--------|
| Litige / chargeback **ouvert** (issue non connue) | Gel 100 % held + blocage retraits sur cet event, le temps de l’instruction PSP |
| Litige / chargeback **confirmé** (résolu) | Devient un **incident** (§7) — déclenche reset compteur + reset held tous events actifs du tenant |
| Event annulé | Politique remboursement votants ; held gelé jusqu’à résolution |
| Rejet admin retrait | Recrédit `withdrawableCfa` + motif visible |
| PSP payout échoué (Tier Pro) | Recrédit automatique + notification |

---

## 9. Expérience organisateur (transparence)

### Wallet (`/dashboard/wallet`)

- **Disponible au retrait** — montant + bouton retrait.
- **Réserve de sécurité** — montant + texte : *« Libéré après clôture de [event] + 48 h »*.
- **Historique retraits** — statuts PENDING / APPROVED / PAID / REJECTED.
- **Journal** — `VOTE_CREDIT`, `HELD_ALLOCATION`, `HELD_RELEASE`, `WITHDRAWAL_DEBIT`, `ADJUSTMENT`.

### Fiche événement

Tableau par event : brut, commission, net, retirable, en réserve, libération prévue.

### Notifications

- Vote milestone (optionnel).
- Réserve libérée post-clôture.
- Retrait approuvé / payé / rejeté.

---

## 10. Console admin

| Fonction | Route / lieu |
|----------|----------------|
| Config taux standard plateforme | `/admin/offers` |
| **Override commission event / tenant** | `/admin/offers/events/[id]`, `/admin/users/[id]` |
| Vue events actifs + CA | `/admin/offers/events` |
| File retraits | `/admin/offers/withdrawals` |
| Override palier de confiance tenant | `/admin/users/[id]` — livré **F5** |
| Audit log (commission + palier confiance) | `/admin/audit` |

---

## 11. Écarts vs implémentation actuelle

| Actuel | Cible |
|--------|-------|
| Commission fixe ou désactivée | Taux standard + override admin event/tenant (floor/ceiling validés, audité) |
| `Event.commissionBps` existe mais peu exposé UI, aucun endpoint admin ne l’écrit | Écriture admin avec validation 4-12 % + audit ; affichage + gel à l’activation |
| Pas de champ `Event.heldBps` (held recalculé en direct depuis le palier tenant) | **Nouveau champ** requis — snapshot au passage DRAFT→ACTIVE + reset ciblé sur incident (§5.3/§7) |
| Aucune détection de litige/chargeback PSP dans `payments/` | À livrer (F2/F5) — condition préalable pour que l’exception « incident casse le gel » (§5.3) soit réellement déclenchable |
| Retenue 5 % à la clôture en plus | Supprimée si commission par vote active |
| Tout en `pending` jusqu’à clôture | Split immédiat held + withdrawable |
| Retrait seulement post-clôture | Mid-event sur withdrawable (cap selon palier de confiance) |
| Payout toujours manuel | Auto PSP **après tests sandbox** (F6, gate §6.1) |
| Pas de poche held visible | 3 soldes affichés + libération datée |
| Destination retrait : API seule | UI wallet / offer |

---

## 12. Roadmap d’implémentation

| Phase | Livrable | Gate |
|-------|----------|------|
| **F1 — Spec & ADR** | ✅ [ADR-020](../../adr/ADR-020-settlement-finance-model.md) rédigé, migration schéma wallet spécifiée, **taux standard + endpoint override admin (floor/ceiling + audit)** | Revue produit (en attente) |
| **F2 — Ledger** | `heldCfa`, crédit vote scindé, résolution commission (standard + override event/tenant) | Tests unitaires wallet |
| **F3 — Retraits manuels** | Mid-event, plafonds, délai 1er retrait, file admin | e2e wallet + mark-paid démo |
| **F4 — UI** | Wallet 3 poches, réserve par event, i18n | Revue UX |
| **F5 — Confiance** | Compteur events sans incident, paliers, **override admin palier** | Tests règles |
| **F6 — Payout auto** *(post-bêta)* | Tier Pro + PSP payout sandbox → staging pilotes → prod | **Checklist §6.1** + GO ops |
| **F7 — Admin** | Curseurs held/commission, **UI négociation par event** | e2e admin |

**Zones sanctuarisées :** verify-by-pull, idempotence paiement, funnel `/e/*`.

---

## 13. Gouvernance code — emplacement de chaque module

**Décision :** tout code qui n’est plus valable pour le business plan Escrow est **supprimé** ou **mis de côté** de façon explicite. Aucun module « fantôme » dans le parcours bêta.

### 13.1 Règles

1. **ACTIF** — utilisé en prod bêta ; maintenu et testé (e2e si parcours critique).
2. **CIBLE** — spécifié dans ce plan (F1–F7) ; pas encore codé ou incomplet.
3. **PARKÉ** — hors parcours produit ; conservé pour migration ou réactivation future (EXTERNAL, abonnements, payouts périodes).
4. **À SUPPRIMER** — remplacé ; suppression après gate + 1 release de grâce.

**Actions concrètes :**

| Situation | Action |
|-----------|--------|
| UI legacy encore accessible | Replier admin **Hérité** ; retirer des sidebars dashboard |
| API encore appelée mais obsolète | Flag `legacy_*` + log deprecation ; puis retrait |
| Module entier parké | JSDoc `@legacy` en tête de module ou déplacement `apps/api/src/_legacy/` (phase N5) |
| Logique remplacée (ex. retenue 5 % clôture) | Supprimer dans PR F2 quand held + commission/vote sont livrés |

**Interdit :** mélanger retrait auto PSP (CIBLE F6) dans `payouts/` legacy — nouveau code dans `offers/withdrawal-payout.service.ts`.

### 13.2 Cartographie détaillée

**Document de référence unique :** [`docs/superpowers/specs/2026-08-28-settlement-module-map.md`](./2026-08-28-settlement-module-map.md)

Résumé :

| Zone | ACTIF (bêta) | PARKÉ (côté) | CIBLE (à build) |
|------|--------------|--------------|-----------------|
| **API payin** | `payments/`, `payment-verify`, `psp/` | — | — |
| **API escrow** | `offers/wallet`, `withdrawals`, `event-stats` | `event-settlement` retenue 5 % → supprimer | `held`/`withdrawable`, override commission, auto payout |
| **API legacy** | — | `subscriptions/`, `payouts/`, `partners/`, EXTERNAL | — |
| **Dashboard orga** | `wallet`, `offer`, `events/[id]` | `subscription/*` (hors nav) | UI held, devis commission |
| **Admin** | `offers/*`, `withdrawals` | `partners`, `payouts`, `plans`, `subscriptions` → Hérité | Négociation commission event |
| **Public** | `/e/*`, vote payment hook | — | — |

### 13.3 Ordre de nettoyage (lié roadmap)

- **N1** : cartographie publiée (module-map) — fait.
- **N2–N4** : aligné F2 (wallet, commission, retrait manuel mid-event).
- **N5–N7** : post-bêta — dossier `_legacy/`, suppression routes subscription dashboard.

Chaque PR finance doit **mettre à jour** le module-map si un fichier change de statut.

---

## 14. Indicateurs de succès

| KPI | Cible bêta |
|-----|------------|
| Écart wallet / ledger | 0 |
| Chargeback non couvert par held | &lt; 0,1 % du GMV |
| Délai médian retrait (manuel) | &lt; 48 h |
| Délai retrait auto (post-gate §6.1) | &lt; 2 h |
| NPS orga sur transparence finance | ≥ 8/10 |
| Tickets « où est mon argent » | −80 % vs modèle pending opaque |

---

## 15. Décision

Ce business plan devient la **référence produit finance** pour SHADOMA Votes Escrow. Les prochaines étapes :

1. ~~Rédiger **ADR-020**~~ — fait : [`docs/adr/ADR-020-settlement-finance-model.md`](../../adr/ADR-020-settlement-finance-model.md), en attente de revue produit.
2. Plan d’implémentation **F1→F4** + retraits **100 % manuels** pour la bêta.
3. Activer taux standard + override admin event/tenant en staging (pilote 2–3 orgas).
4. **F6 retrait auto** uniquement après checklist §6.1 validée en sandbox PSP.
5. Tenir à jour **[module-map](./2026-08-28-settlement-module-map.md)** à chaque changement finance.
