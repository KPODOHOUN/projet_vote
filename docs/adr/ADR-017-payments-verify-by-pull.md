## ADR-017 : Paiements — Verify-by-pull (la vérité vient de Feexpay, jamais du webhook)
**Statut** : Accepté
**Date** : 2026-06-03
**Décideurs** : Tech Lead, Payments Expert, Security Engineer
**Supersede partiellement** : [ADR-014](./ADR-014-payments.md) (règle "HMAC obligatoire des callbacks")

### Contexte
Notre code actuel (`payments.service.ts#processWebhook`) faisait confiance au webhook Feexpay comme **source de vérité** : si la signature HMAC `x-feexpay-signature` validait, alors `Vote.paidAt` était posé et le vote entrait dans le tally.

Trois découvertes ont invalidé cette posture :

1. **Feexpay ne signe pas ses webhooks.** La documentation officielle ([api-v2.feexpay.me/docs](https://docs.feexpay.me/)) ne décrit aucun header de signature, aucun secret partagé, aucun HMAC. Notre vérification HMAC est donc un **placebo** : Feexpay n'envoie jamais le header attendu. En prod, soit le header serait absent → tous les vrais webhooks rejetés, soit nous l'aurions ignoré → aucun attaquant filtré.
2. **Notre `FEEXPAY_WEBHOOK_SECRET` avait une valeur par défaut versionnée.** Tout opérateur déployant sans poser explicitement la variable d'env aurait laissé un secret public connu de quiconque a accès au repo.
3. **Le payload du webhook contient `amount`, mais notre schéma Zod ne le lit pas.** Un webhook acceptant `status: "SUCCEEDED"` sans relire le montant aurait laissé passer des votes 10 000 FCFA confirmés par une "transaction Feexpay" de 100 FCFA — fuite d'argent côté organisateur.

Sur une plateforme de **paiements à l'acte** où chaque vote = un montant collecté, "compter un vote sans argent reçu" = fraude monétaire silencieuse. C'est inacceptable.

### Options évaluées
| Option | Pros | Cons | Complexité | Score |
|---|---|---|---|---|
| A — Garder le webhook signé HMAC | Connu, simple | **Feexpay ne signe pas** → faux sentiment de sécurité ; aucune défense réelle | 1 | 1/10 |
| B — Ajouter validation du montant côté webhook | Bloque les payloads incohérents | Toujours dépendant que le webhook ne soit pas forgé ; aucune authenticité de l'origine | 2 | 3/10 |
| C — **Verify-by-pull** : ignorer le contenu du webhook, appeler `GET /api/transactions/public/single/status/{reference}` avant toute mutation | Vérité provient directement de Feexpay (authenticité par TLS + API key) ; immune au webhook forgé ; détecte les divergences amount/devise/statut ; même chemin pour la reconciliation cron | Une requête HTTP par webhook ; impossible si Feexpay est indisponible (mais on retry) | 3 | 9/10 |
| D — Migration vers un PSP qui signe (Stripe-like) | Modèle éprouvé | Pas de provider Mobile Money OAB qui signe nativement ; rewrite complet | 5 | 4/10 |

### Décision
**Option C retenue : Verify-by-pull**

Le webhook devient un **simple ping non authentifié** ("hé, va revérifier la transaction `<reference>`"). Aucune donnée du webhook n'est crue. La séquence officielle est :

1. Webhook arrive → parse minimal (`reference` ou `order_id`), retourne 200 immédiatement.
2. Côté serveur, on appelle `GET https://api-v2.feexpay.me/api/transactions/public/single/status/{reference}` avec `Authorization: Bearer ${FEEXPAY_API_KEY}`.
3. On localise la `PaymentTransaction` interne par `providerRef = reference` (stocké à l'init).
4. **Tous les checks suivants doivent passer** sinon aucune mutation et un `AuditLog` (`payment.verify_rejected`) est écrit :
   - `pullStatus.status === "SUCCESSFUL"` (Feexpay emploie `SUCCESSFUL`, pas `SUCCEEDED`)
   - `Number(pullStatus.amount) === tx.amountCfa`
   - `pullStatus.currency === "XOF"`
   - `tx.status === PENDING` (anti-rejeu / anti-flip d'un VOIDED)
5. Si OK : `prisma.$transaction([update tx → SUCCEEDED + providerRef + commissionCfa, update vote.paidAt, insert auditLog])`.
6. Si Feexpay répond `FAILED` (terminal négatif), on marque la transaction `FAILED`. Si `PENDING`, on ne fait rien (un autre webhook viendra, ou le cron de reconciliation re-pullera).

### Conséquences positives
- **Fuite monétaire éliminée** : impossible de comptabiliser un vote sans confirmation directe par Feexpay du même montant.
- **Webhook forgé inoffensif** : sans access au compte Feexpay merchant, l'attaquant n'obtient rien.
- **Reconciliation triviale** : le job cron utilise exactement la même fonction `pullAndApply(reference)` que le webhook.
- **Suppression du secret webhook placebo** : `FEEXPAY_WEBHOOK_SECRET` est retiré ; on garde uniquement `FEEXPAY_API_KEY` (Bearer pour le pull) et `FEEXPAY_BASE_URL` (sandbox vs prod).

### Conséquences négatives / tech debt
- Une requête HTTP sortante par webhook (latence ~100-300ms). Acceptable : déjà 99% du flux est asynchrone côté client (SSE `/payments/public/status/stream`).
- Si Feexpay est indisponible au moment du webhook, on ne peut pas confirmer immédiatement. **Mitigation** : le cron de reconciliation (toutes les 5 min, voir TD-PAY-001) re-pull les transactions `PENDING` créées il y a > 2 min.
- L'init des paiements MoMo doit être faite **côté serveur** (pour que `providerRef` soit stocké en DB dès `T+0`). Le bouton JS Feexpay reste utilisable pour la carte bancaire (où le flux passe par redirection), mais pour MoMo (USSD push) on appelle `POST /api/transactions/public/requesttopay/{operator}` côté API depuis `payments.service.ts`. Refacto de `initPaymentCore` requise.

### Règles qui découlent de cette décision
- **Aucune mutation de `Vote.paidAt` ne peut survenir sans un `pullStatus` Feexpay réussi sur la même `paymentTransaction.providerRef` AVEC le même `amount` ET la devise `XOF`.**
- **`processWebhook` n'a plus le droit de lire `status`/`amount` du payload entrant** — il n'extrait que `reference` (ou `order_id` en fallback) puis délègue à `pullAndApply(reference)`.
- **`PaymentTransaction.providerRef` est stocké dès l'init**, jamais à la réception du webhook.
- **L'endpoint webhook reste public** (Feexpay ne fournit pas d'IP fixe documentée) ; il est rate-limité (déjà 120/min via Throttle) et son seul effet est de déclencher un pull. Aucune mutation depuis le payload.
- **`FEEXPAY_WEBHOOK_SECRET` est supprimé de `env.ts`.** Si on découvre plus tard que Feexpay propose un mécanisme de signature, on l'ajoute en defense-in-depth (le verify-by-pull reste la défense primaire).
- **`FEEXPAY_API_KEY` doit suivre le préfixe attendu** : `fp_` (LIVE) ou `test_` (SANDBOX). Validation Zod côté env.
- **Toute commission est appliquée uniquement après confirmation Feexpay** (resolveCommissionCfa déjà conditionné, conserver).
- **Audit obligatoire sur tout rejet de pull** : `payment.verify_rejected` avec `metadata: { reason, expectedAmount, actualAmount, expectedCurrency, actualCurrency, providerStatus }`.

### Suivi
- TD-PAY-001 : Job cron `feexpay-reconciliation` (5 min) — re-pull les `PENDING > 2 min`, échantillonne 1% des `SUCCEEDED` récents pour drift detection. *Priorité 3.5, sprint suivant.*
- TD-PAY-002 : Whitelist IP Feexpay si publiée. *Priorité 1.0, opportunité.*
- TD-PAY-003 : Métriques `feexpay_pull_latency_ms`, `feexpay_pull_errors_total{reason}`, `payment_verify_rejected_total{reason}`. *Priorité 2.5.*
