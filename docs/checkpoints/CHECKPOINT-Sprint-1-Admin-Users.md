## 🔖 CHECKPOINT — Sprint 1 — Admin Users

### État du projet
- Feature terminée : API admin pour lister les utilisateurs (`GET /api/v1/admin/users`).
- Feature terminée : page dashboard `Admin - Utilisateurs` avec filtres (rôle, email), pagination cursor et état vide.
- Feature en cours (Sprint 1): subscriptions, feature flags, jobs center.

### Fichiers modifiés
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/web/app/dashboard/admin/users/page.tsx`
- `apps/web/app/dashboard/layout.tsx`
- `README.md`

### Validation
- Build API: OK (`npm run build --workspace=@votezpro/api`)
- Build Web: OK (`npm run build --workspace=@votezpro/web`)

### Notes
- Contrôle d'accès conservé : `PLATFORM_ADMIN` et `ORGANIZER_OWNER`.
- Scope tenant respecté pour `ORGANIZER_OWNER` (pas d'accès cross-tenant).
