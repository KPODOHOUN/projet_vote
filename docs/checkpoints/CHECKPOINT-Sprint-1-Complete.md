## 🔖 CHECKPOINT — Sprint 1 — Complete

### Fonctionnalités Sprint 1 complétées
- Admin Users:
  - `GET /api/v1/admin/users`
  - page dashboard `Admin Users`
- Admin Feature Flags:
  - `GET /api/v1/admin/feature-flags`
  - `POST /api/v1/admin/feature-flags`
  - page dashboard `Feature Flags`
- Admin Jobs Center:
  - `GET /api/v1/admin/jobs/overview`
  - page dashboard `Jobs Center`
- Admin Subscriptions:
  - `GET /api/v1/admin/subscriptions/overview`
  - page dashboard `Subscriptions`

### Validation technique
- Build API: OK
- Build Web: OK
- Toutes les nouvelles pages dashboard sont compilées et routables.

### Qualité
- Zero fake data : les vues admin reposent sur `User`, `PaymentTransaction`, `IdempotencyKey`, `AuthSession`, `AuditLog`, `TenantSecret`.
- Contrats API stricts maintenus.
- Isolation tenant maintenue selon le rôle.

### Fichiers clés modifiés
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/admin/admin.module.ts`
- `apps/api/src/organizer-secrets/organizer-secrets.module.ts`
- `apps/web/app/dashboard/layout.tsx`
- `apps/web/app/dashboard/admin/users/page.tsx`
- `apps/web/app/dashboard/admin/feature-flags/page.tsx`
- `apps/web/app/dashboard/admin/jobs/page.tsx`
- `apps/web/app/dashboard/admin/subscriptions/page.tsx`
- `README.md`

### Prochaine étape (Sprint 2 / P1 restant)
- i18n FR/EN end-to-end (suppression des strings hardcodées).
- Durcissement des tests (unit/intégration/component) sur les nouveaux modules admin.
- Observabilité complète Sentry frontend/backend + alerting incident.
