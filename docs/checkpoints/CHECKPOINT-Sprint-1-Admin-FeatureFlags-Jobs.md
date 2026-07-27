## 🔖 CHECKPOINT — Sprint 1 — Feature Flags & Jobs Center

### État du projet
- Feature terminée : API admin feature flags (`GET/POST /api/v1/admin/feature-flags`) avec stockage chiffré via `TenantSecret`.
- Feature terminée : API jobs center (`GET /api/v1/admin/jobs/overview`) basée sur des données réelles (payments, sessions, idempotency, maintenance logs).
- Feature terminée : pages dashboard `Feature Flags` et `Jobs Center`.

### Fichiers modifiés
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/admin/admin.module.ts`
- `apps/api/src/organizer-secrets/organizer-secrets.module.ts`
- `apps/web/app/dashboard/admin/feature-flags/page.tsx`
- `apps/web/app/dashboard/admin/jobs/page.tsx`
- `apps/web/app/dashboard/layout.tsx`
- `README.md`

### Validation
- Build API: OK (`npm run build --workspace=@votezpro/api`)
- Build Web: OK (`npm run build --workspace=@votezpro/web`)

### Notes
- Aucun placeholder: les KPIs jobs viennent des tables `PaymentTransaction`, `AuthSession`, `IdempotencyKey`, `AuditLog`.
- Les feature flags sont scope tenant et tracés dans les `AuditLog`.
