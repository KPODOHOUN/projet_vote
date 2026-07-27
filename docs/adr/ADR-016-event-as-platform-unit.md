# ADR-016 : L'événement comme unité « plateforme »

**Statut** : Accepté
**Date** : 2026-05-31
**Décideurs** : Tech Lead + Product + Backend + Security + Payments

## Contexte

Le modèle initial faisait de l'**organisateur** (`Tenant`) l'unité « plateforme » : un espace `/vote/{tenantSlug}` regroupant ses événements. Le produit souhaite désormais que **chaque événement soit la plateforme publique principale** (sa propre identité/URL/branding), l'organisateur restant un **compte** qui agrège ses événements et permet une **offre négociée multi-événements**.

Analogie : Chariow/Shopify créent une boutique par vendeur ; ici on veut « une plateforme par concours », l'organisateur jouant le rôle de compte propriétaire.

## Décision

| Axe | Choix retenu |
|-----|--------------|
| **URL publique** | Chemin global `votezpro.africa/e/{eventSlug}` — slug d'événement **globalement unique**. (Sous-domaines `{slug}.votezpro.africa` = évolution future, non bloquante.) |
| **Isolation données** | **`tenantId` (organisateur) reste la frontière de sécurité** (RLS applicative existante conservée). L'`Event` devient l'unité **publique** avec sa configuration propre. Pas de refonte de l'isolation. |
| **Config par événement** | Branding (logo, couleur, tagline), **compte de paiement FeexPay**, règles de vote (période, prix unitaire) **propres à l'événement**, **hérités de l'organisateur par défaut** (surcharge au niveau événement). |
| **Facturation** | **Par événement** (unité facturée) + **remise/bundle** négociable pour un organisateur multi-événements. |

### Pourquoi pas « Event = tenant complet »
Refonte lourde (migrations, ré-écriture de tous les scopes `tenantId`, re-tests, perte du durcissement déjà livré) pour un bénéfice nul ici : la frontière de **sécurité** pertinente reste l'organisateur (qui possède comptes, secrets, revenus). On élève l'Event au rang d'unité **produit/publique** sans toucher à la frontière de **sécurité**.

## Conséquences

**Positives**
- Réutilise 100 % du durcissement multi-tenant déjà livré (`tenantId` partout).
- URL « plateforme dédiée » par événement, identité visuelle propre.
- Paiement routable par événement (sous-comptes FeexPay distincts).
- Facturation granulaire alignée sur l'usage réel.

**Négatives / dette acceptée**
- `Event.slug` devient **globalement unique** (collision possible entre organisateurs) → on génère/valide l'unicité globale (suffixe si besoin).
- La résolution de paiement/branding doit gérer le **fallback** event → organisateur.
- Facturation par événement = nouveau domaine (modèle + lifecycle), livré en phase dédiée.

## Plan d'implémentation (phasé)

- **Phase 1 — Event = unité publique** *(fondation)*
  - `Event.slug` globalement unique + route publique `/e/{eventSlug}` + endpoints `…/public/event/{eventSlug}`.
  - Branding hérité : `Tenant.{logoUrl,brandColor}` + `Event.{logoUrl,brandColor,tagline}` (override).
  - Règles de vote par événement : `Event.voteUnitPriceCfa?`.
  - Page publique event-centrée + dashboard inchangé (l'orga voit tous ses events).
- **Phase 2 — Paiement par événement**
  - Secret/compte FeexPay résolu **event d'abord, organisateur en fallback** (réutilise le chiffrement AES-GCM).
- **Phase 3 — Facturation par événement**
  - Modèle `EventBilling`/plan + bundles négociés (remise multi-événements).

## Règles découlant de cette décision
- Toute nouvelle ressource publique se résout **par `eventSlug` global**, puis remonte au `tenantId` pour l'isolation.
- Toute config (branding, paiement, règles) suit le pattern **« event override, sinon hérite de l'organisateur »**.
- L'isolation base reste **strictement par `tenantId`** — inchangée.
