# Système de rémunération — Refonte (Vault, Webhook strict, Payouts, Partenaires, Privacy)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre le système de rémunération de VotezPro avec : (1) un coffre-fort chiffré pour les votes effacés, (2) une règle webhook-strict pour les votes, (3) des versements automatiques anti-doublons via FeexPay, (4) une offre partenaire "activate-now-pay-later" avec dette recouvrée sur les payouts, (5) une politique de confidentialité publique avec consentement traçable.

**Architecture:** Tout est ajouté au backend NestJS existant (`apps/api`) + nouvelles tables Prisma dans `packages/db`. Les 5 features sont organisées en 6 phases livrables indépendamment ; chaque phase finit avec build vert + tests verts + commit. La compatibilité avec le code existant est préservée : `PaymentTransaction` reste le ledger principal ; `Vote.paidAt` reste la porte de tally ; le rôle existant `PLATFORM_ADMIN` est complété d'un cran `PLATFORM_SUPER_ADMIN`.

**Tech Stack:** NestJS 11, Prisma + PostgreSQL, Zod, `node:crypto` (AES-256-GCM, HMAC-SHA256, scrypt), `node:test`, JSZip pour exports. Pas de nouvelle dépendance externe.

---

## Plan structuré en 6 phases

Chaque phase est dans son propre fichier pour rester lisible. Suis-les **dans l'ordre** : chaque phase suppose que les précédentes sont mergées.

- **[Phase 0 — Préparation & règle webhook stricte](2026-06-02-remuneration-phase-0-prep.md)** — Vérifie l'état initial, ajoute le rôle `PLATFORM_SUPER_ADMIN`, **durcit la règle "no webhook = no vote"** (déjà presque en place, mais on la formalise par un test et un commentaire), et ajoute le scan de cohérence Vote/Payment qui sera réutilisé partout.
- **[Phase 1 — Coffre-fort chiffré des votes effacés](2026-06-02-remuneration-phase-1-vault.md)** — Nouvelle table `VaultEntry`, chiffrement AES-256-GCM avec clé dédiée, route `/admin/platform/vault/*` réservée à `PLATFORM_SUPER_ADMIN`, basculement automatique sur cancel/delete de vote, suppression complète de `PaymentTransaction` côté ledger.
- **[Phase 2 — Politique de confidentialité & consentement](2026-06-02-remuneration-phase-2-privacy.md)** — Nouvelle table `PrivacyConsent`, endpoint public de version courante, blocage du `castVote` sans consentement horodaté, page Markdown servie.
- **[Phase 3 — Payouts automatiques avec garde anti-doublons](2026-06-02-remuneration-phase-3-payouts.md)** — Nouvelles tables `PayoutPeriod`, `Payout`, `PayoutLine`, **6 couches anti-doublon** (clé d'idempotence, verrou SQL, statut INCERTAIN, réconciliation, verrou distribué, limite de solde), endpoints admin de pilotage.
- **[Phase 4 — Offre partenaire (activate-now-pay-later)](2026-06-02-remuneration-phase-4-partner.md)** — `Tenant.isPartner`, `PartnerRequest`, `ActivationDebt`, `ActivationRecovery`, taux de commission majoré, blocage de création d'événement tant que dette > 0, recouvrement automatique branché dans Phase 3.
- **[Phase 5 — Confiscation 100% & finitions](2026-06-02-remuneration-phase-5-confiscation.md)** — La confiscation des votes annulés (déjà "VOIDED + retire des agrégats" en Phase 1) devient officiellement "100% plateforme" dans le calcul des payouts (Phase 3), bilan d'overview admin enrichi, suite de tests d'intégration de bout en bout.

---

## Décisions verrouillées (rappel des Q&R)

| Décision | Choix |
|---|---|
| Trace des votes annulés | **Option B+** : effacés du ledger principal, copie chiffrée dans coffre-fort caché |
| Accès coffre-fort | **2FA email simple, sans audit détaillé** des consultations |
| Dette partenaire non soldée | **Reportée + blocage** : reste active sur le prochain événement ; nouveau create event interdit tant que dette > 0 |
| Commission partenaire | **Taux majoré** : champ dédié, configurable par l'admin, hérité par défaut sur tous les events partenaires |
| Devise | XOF (FCFA) uniquement |
| Provider | FeexPay uniquement |
| Anti-doublon payouts | **6 couches** : clé idempotence + verrou SQL row + statut INCERTAIN + réconciliation + verrou distribué + plafond solde |

---

## Conventions de toutes les phases

- **TDD strict** : chaque tâche commence par un test qui échoue, puis l'implémentation minimale, puis le passage du test. Pas de "Step 3 : add tests" en fin de tâche.
- **Tests réels** : tous les `*.service.test.ts` tournent contre `votezpro_test` (PostgreSQL réel), pas de mock Prisma. Conforme à `apps/api/src/test-utils/db.ts`.
- **Migrations** : un dossier `packages/db/prisma/migrations/<YYYYMMDDHHMMSS>_<slug>/migration.sql` + mise à jour de `schema.prisma`. Utilise un timestamp strictement > `20260601100000`.
- **Imports `@prisma/client`** : les nouveaux modèles passent par `import { ModelName } from "@prisma/client"`. Toujours lancer `npm --workspace=@votezpro/db run build` après une migration pour régénérer les types.
- **Audit log** : utilise la table `AuditLog` existante (`tenantId` requis ; pour les actions cross-tenant, mettre le tenantId de la cible).
- **Audit log silencieux** : pour les commissions et le coffre-fort, **ne pas** écrire dans `AuditLog`. C'est volontaire.
- **Commits** : un commit par tâche complète, message en français concis, format conventionnel `feat:`, `fix:`, `chore:`, `test:`.
- **Modifications `test-utils/db.ts`** : à chaque nouvelle table, l'ajouter à la constante `TABLES` pour que `resetDatabase()` la purge entre tests.
- **Modifications `app.module.ts`** : à chaque nouveau module Nest, l'enregistrer dans `imports: [...]`.
- **Modifications `package.json` (apps/api)** : à chaque nouveau fichier `*.test.ts`, l'ajouter aux scripts `test` et `test:coverage`.

---

## Ordre d'exécution recommandé

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5
   │           │           │           │            │           │
  prep      vault       privacy     payouts     partner     finitions
 (1 jour)  (2 jours)   (1 jour)   (3 jours)    (2 jours)   (1 jour)
```

Estimation totale : ~10 jours-développeur en TDD strict.

---

## Self-review (à exécuter par l'agent avant de finir le plan)

Avant le premier commit, l'agent doit :

1. **Couverture du spec** : pour chaque décision verrouillée ci-dessus, identifier la tâche qui l'implémente. Si une case manque, l'ajouter.
2. **Cohérence des types** : vérifier que les noms des nouveaux modèles Prisma (`VaultEntry`, `Payout`, `PayoutLine`, `PayoutPeriod`, `PartnerRequest`, `ActivationDebt`, `ActivationRecovery`, `PrivacyConsent`) ainsi que les nouveaux enums (`PayoutStatus`, `PayoutPeriodStatus`, `PartnerRequestStatus`, `ActivationDebtStatus`) sont identiques dans le schema.prisma, les services, les tests et les contrôleurs.
3. **Pas de placeholders** : aucun "TODO", "à compléter", "similar to Task N". Si un test est mentionné, son code complet est dans la tâche.
