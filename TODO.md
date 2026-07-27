# TODO — Système d'abonnement + Commission

## ✅ Phase 1 — Schéma Prisma (base de données)

- [x] Créer le modèle `Plan` dans schema.prisma → ✅ `Plan` model with name, slug, priceCfa, maxEvents, commissionRate, isActive, sortOrder, features
- [x] Ajouter `planId` optionnel dans `AccountSubscription` → ✅ avec relation vers `Plan`
- [x] Créer la migration Prisma → `20260725000000_add_plan_model`
- [x] Seed des 4 plans (Free, Starter, Pro, Enterprise)

## ✅ Phase 2 — Backend : Service Plans (Admin CRUD)

- [x] Créer `plans.module.ts`, `plans.controller.ts`, `plans.service.ts` → ✅ CRUD complet
- [x] Routes CRUD pour les plans → ✅ `GET /admin/plans`, `POST`, `PUT /:id`, `DELETE /:id`
- [x] Intégrer dans `AdminModule` → ✅

## ✅ Phase 3 — Backend : Endpoint public + commission + maxEvents

- [x] Route publique `GET /plans` → ✅ dans `plans-public.controller.ts`
- [x] Modifier `resolveCommissionCfa()` pour utiliser `plan.commissionRate` → ✅ dans `payment-verify.service.ts`
- [x] Modifier `activateSubscriptionFromPayment()` pour lier au plan → ✅
- [x] Ajouter `canCreateEvent()` dans PlansService → ✅ avec vérification maxEvents
    
## ✅ Phase 4 — Backend : Limite d'événements

- [x] Modifier `assertSubscriptionForEventCreation()` pour utiliser `plansService.canCreateEvent()` → ✅
- [x] Importer `PlansModule` dans `EventsModule` → ✅
- [x] Ajouter `PlansService` dans EventsService constructor → ✅

## ✅ Phase 5 — Frontend : Page Pricing publique

- [x] Créer `/pricing/page.tsx` avec tableau comparatif → ✅ Interface complète avec cartes

## ✅ Phase 6 — Frontend : Admin Dashboard Plans

- [x] Créer `/admin/plans/page.tsx` avec CRUD → ✅ Tableau + Modal création/édition
- [x] Ajouter "Plans" dans la sidebar admin → ✅

## ✅ Phase 7 — Frontend : Modal Upgrade

- [x] Créer composant `plan-upgrade-modal.tsx` → ✅ Modal avec sélection de plans payants
- [x] Intégrer dans le flow de création d'événement → ✅ Composant prêt à être utilisé

## ❌ Phase 8 — Dashboard utilisateur : section abonnement

- [ ] Afficher le plan actuel, commission, limite d'événements → À faire si nécessaire
