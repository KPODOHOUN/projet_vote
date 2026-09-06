## ADR-020 : Settlement Escrow — commission par vote, held/withdrawable, palier de confiance
**Statut** : Proposé (F1 — en attente revue produit)
**Date** : 2026-09-05
**Décideurs** : Product Owner, Tech Lead
**Remplace / complète** : [ADR-019](./ADR-019-settlement-offers.md) (offre ESCROW : wallet pending → clôture (retenue) → available) — la retenue de clôture à 5% est remplacée par une commission par vote + réserve `held` dynamique.
**Référence détaillée** : [`docs/superpowers/specs/2026-08-28-settlement-business-plan.md`](../superpowers/specs/2026-08-28-settlement-business-plan.md) — cet ADR en est le résumé décisionnel formel ; se référer au business plan pour la narration complète (workflows, exemples, KPI).

### Contexte

Le modèle actuel (ADR-019) crédite tout vote payant dans `OrganizerWallet.pendingCfa`, sans distinction, et ne libère l'argent qu'à la clôture manuelle de l'event via une retenue plateforme unique de 5% (`event-settlement.service.ts`). Conséquences observées :

- Un organisateur ne voit rien de retirable avant la fin de son concours, quelle que soit sa durée.
- Aucune commission par vote n'est réellement exploitée pour l'offre Escrow (`Event.commissionBps` / `Tenant.commissionBps` existent en base mais aucun endpoint admin ne les écrit encore, cf. business plan §11).
- Le risque plateforme (litige, fraude, chargeback) et le mécanisme de protection (la retenue) ne sont pas dimensionnés sur un signal de confiance réel — c'est une constante unique appliquée à tous.

Deux designs alternatifs ont été explorés et rejetés en cours de discussion (voir « Options évaluées »).

### Décision

**D1 — Portefeuille à 4 poches**, calculé par vote `SUCCEEDED` (verify-by-pull, cf. ADR-017) :
```
commission = floor(brut × commission_bps / 10_000)   → OrganizerWallet.commissionCfa (info, jamais retirable)
net         = brut − commission
held        = floor(net × held_bps / 10_000)         → OrganizerWallet.heldCfa (réserve, non retirable)
withdrawable = net − held                             → OrganizerWallet.withdrawableCfa (retirable)
```
`heldCfa` d'un event se libère dans `withdrawableCfa` 48h après sa clôture (anti-litige PSP). La retenue de clôture à 5% (`offer2_retention_bps`) est supprimée — une seule commission, prélevée à l'entrée, jamais deux.

**D2 — Commission : taux standard par défaut, override admin exceptionnel.** Pas de grille automatique basée sur un volume déclaré par l'organisateur (rejetée, voir options évaluées). Résolution : `Event.commissionBps` (1) → `Tenant.commissionBps` (2) → taux standard plateforme par tier (3, `offer2_per_vote_commission_bps_standard` / `_pro`). Tout override reste dans la fourchette **4%–12%**, dans les deux sens ; en sortir nécessite le rôle `PLATFORM_SUPER_ADMIN` (existe déjà dans `UserRole`) et écrit un `AuditLog` (modèle déjà existant, aucune nouvelle table). Le taux est gelé à l'activation de l'event — aucune exception.

**D3 — Palier de confiance par compteur, pas par score composite.** Pas de score pondéré multi-signaux (rejeté, voir options évaluées). Le palier (Nouveau / Établi / Trusted) dépend d'un unique compteur serveur : nombre d'events clôturés sans incident consécutifs, ignorant les events sous un seuil de volume minimal (anti-gaming). Un **incident** (litige/chargeback PSP confirmé, ou fraude confirmée admin) réinitialise le compteur à 0 **et** bloque immédiatement la création de tout nouvel event par ce tenant jusqu'à revue manuelle admin — sans exception liée à l'ancienneté du compte. `heldBps` est gelé à l'activation de l'event comme `commissionBps`, sauf incident sur un autre event actif du même tenant, qui casse le gel et repasse tous les events actifs de ce tenant au palier Nouveau immédiatement.

**D4 — Cap de retrait mid-event : règle binaire, pas d'agrégation par event.** Tant qu'au moins un event du tenant est ACTIF, le cap (piloté par le palier, identique Standard/Pro) s'applique à tout `withdrawableCfa` du wallet. Dès que tous les events sont clôturés, le cap se lève entièrement (seul le plafond journalier reste). Choisi car `WithdrawalRequest` n'est pas rattaché à un `eventId` dans le modèle actuel — un cap « par event » exigerait une notion qui n'existe pas aujourd'hui.

**D5 — Retrait auto PSP : hors scope initial.** 100% manuel (admin approve + `mark-paid`) en bêta et en prod initiale, y compris pour le Tier Pro. L'automatisation ne s'active qu'après une checklist sandbox complète (idempotence, gestion d'échec, recrédit) — c'est un confort optionnel, jamais un prérequis de lancement.

### Options évaluées

| Option | Pros | Cons | Retenue |
|---|---|---|---|
| **Commission — grille par palier de GMV déclaré à la création** | Tarif dégressif « naturel », logique commerciale simple | Volume auto-déclaré par l'organisateur, non vérifiable ; aucune remontée rétroactive prévue si le réel dépasse le déclaré → sur-déclaration sans conséquence pour obtenir un taux et une réserve plus bas | ❌ Rejetée |
| **Commission — taux standard + override admin audité** | Aucune donnée auto-déclarée à faire confiance ; le seul levier de variation passe par un admin, tracé | Moins de "auto-service" pour l'organisateur (doit demander un devis) | ✅ Retenue |
| **Confiance — score composite pondéré (ancienneté, volume, identité, litige)** | Signal riche en théorie | Aucune formule ni propriétaire définis ; signal « identité » sans KYC existant dans le code ; aucun chemin de contestation prévu dans la roadmap livrée | ❌ Rejetée |
| **Confiance — compteur simple (events clôturés sans incident)** | 100% vérifiable côté serveur, aucune saisie déclarative, formule triviale à auditer | Moins nuancé qu'un score continu | ✅ Retenue |

### Migration schéma (vérifié contre `packages/db/prisma/schema.prisma` actuel)

- **`Event`** : nouveau champ `heldBps Int?` (snapshot du taux held à l'activation — `commissionBps` existe déjà, pas de changement requis dessus) ; nouveaux champs `incidentAt DateTime?` + `incidentReason String?` (marque un event comme ayant eu un incident confirmé, sert de borne pour le compteur de confiance).
- **`Tenant`** : nouveau champ `trustCounterResetAt DateTime?` (borne — seuls les events clôturés après cette date comptent dans le compteur de confiance) ; nouveau champ `trustTierOverride` (enum nullable, force le palier par un admin) ; nouveaux champs `eventCreationBlockedAt DateTime?` + `eventCreationBlockedReason String?` (flag de revue manuelle qui bloque la création d'event).
- **`WalletLedgerKind`** (enum) : ajouter `HELD_ALLOCATION` et `HELD_RELEASE` — déjà mentionnés dans le business plan §9 (journal orga) mais absents de l'enum actuel (`VOTE_CREDIT`, `TOPUP_CREDIT`, `RETENTION_DEBIT`, `WITHDRAWAL_DEBIT`, `ADJUSTMENT`).
- **`OrganizerWallet`** : `pendingCfa` → `heldCfa`, `availableCfa` → `withdrawableCfa` (rename + migration de données ; pas de nouvelle colonne `commissionCfa`/`grossCfa` stockée — ce sont des agrégats calculés depuis le ledger, pas des soldes).
- **Aucune nouvelle table requise pour l'audit** : `AuditLog` existe déjà (`tenantId`, `actorUserId`, `actorRole`, `action`, `targetType`, `targetId`, `metadata`) — suffisant pour tracer les overrides de commission et de palier.
- **Aucune nouvelle table requise pour la config** : `PlatformSetting` (clé/valeur) existe déjà — nouvelles clés à créer : `offer2_per_vote_commission_bps_standard`, `offer2_per_vote_commission_bps_pro`, `settlement_held_bps_{nouveau,etabli,trusted}`, `settlement_held_bps_pro_discount`, `mid_event_withdrawal_cap_bps_{nouveau,etabli,trusted}`, `first_withdrawal_delay_hours_{standard,pro}`, `daily_withdrawal_cap_cfa_{standard,pro}`, `held_release_delay_hours`, `trust_counter_min_votes_cfa`, `withdrawal_auto_psp_enabled`, `single_pending_withdrawal_enabled`.
- **Nouvel endpoint admin requis** : aucun endpoint n'écrit `Event.commissionBps` / `Tenant.commissionBps` pour l'escrow aujourd'hui — à créer avec la validation 4-12% + audit dès F1/F2 (pas un retrofit après coup).

### Conséquences positives

- Un organisateur voit et retire de l'argent en cours d'event, plus seulement à la clôture.
- Le risque plateforme (held) suit un signal réellement mesuré (compteur), pas une constante uniforme.
- Toute dérogation de taux ou de palier est tracée nativement (`AuditLog` déjà en place).
- Aucune nouvelle table lourde (contrat, score composite) — uniquement des champs simples sur des modèles existants et des clés `PlatformSetting`.

### Conséquences négatives / tech debt

- **Dépendance non résolue** : l'exception « incident casse le gel du held » (D3) et le compteur de confiance dépendent tous deux d'une détection de litige/chargeback PSP — **aucun webhook de dispute n'existe aujourd'hui** dans `payments/`. Tant que cette brique n'est pas livrée, un « incident » ne peut être déclenché que manuellement par un admin (`incidentAt` posé à la main) — c'est un mode dégradé acceptable pour la bêta, mais pas la cible F5.
- Le rename `pendingCfa`/`availableCfa` → `heldCfa`/`withdrawableCfa` touche du code déjà en prod (bêta) ; migration de données à faire dans la même PR pour éviter un état incohérent.
- Le cap mid-event binaire (D4) est plus conservateur que nécessaire tant qu'un event est actif — un organisateur avec un event clôturé propre et un autre encore ouvert reste plafonné sur l'intégralité de son solde, pas seulement sur la part de l'event ouvert.

### Règles qui découlent de cette décision

- Aucun crédit wallet sans `PaymentTransaction.SUCCEEDED` (verify-by-pull, ADR-017).
- `commissionBps` et `heldBps` sont tous deux gelés sur l'`Event` dès l'activation ; seule une écriture d'incident sur un autre event actif du même tenant peut casser le gel du `heldBps` (jamais celui du `commissionBps`).
- Tout override de commission ou de palier hors du cas nominal écrit un `AuditLog` — pas d'écriture silencieuse.
- Tout incident bloque la création de nouveaux events pour ce tenant jusqu'à levée manuelle par un admin, sans exception liée à l'ancienneté du compte.
- Le retrait auto PSP reste derrière `withdrawal_auto_psp_enabled=false` en production jusqu'à la checklist §6.1 du business plan.

### Suivi

- TD-SETTLE-001 : Webhook/pipeline de détection de dispute PSP (FedaPay/FeexPay/Kkiapay) — prérequis pour que l'exception d'incident (D3) soit autre chose qu'un déclenchement manuel admin. *Bloquant pour F5, pas pour F1-F4.*
- TD-SETTLE-002 : Vérifier auprès des PSP la fenêtre réelle de contestation Mobile Money — le délai de 48h de libération held (business plan §4/§8) n'est aujourd'hui adossé à aucune donnée contractuelle.
- TD-SETTLE-003 : Politique de remboursement votant en cas d'event annulé (business plan §8) — référencée mais non définie ; à spécifier avant que ce cas se présente en prod.
