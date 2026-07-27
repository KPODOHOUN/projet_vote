import { apiFetch } from "./api";

export type AdminUser = {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUsersResponse = {
  items: AdminUser[];
  nextCursor: string | null;
};

export type UpdateAdminUserPayload = {
  role?: string;
  suspended?: boolean;
  suspendedReason?: string;
};

export function updateAdminUser(token: string, userId: string, payload: UpdateAdminUserPayload) {
  return apiFetch<AdminUser>(`/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` }
  });
}

/** Capacités API internes — non exposées dans l'UI (ops / CLI uniquement). */
export const INTERNAL_PLATFORM_CAPABILITIES = [
  {
    id: "vault",
    labelFr: "Coffre-fort votes supprimés",
    labelEn: "Deleted votes vault",
    apiPrefix: "/admin/platform/vault",
    minRole: "PLATFORM_SUPER_ADMIN"
  },
  {
    id: "rgpd-export",
    labelFr: "Export RGPD compte",
    labelEn: "Account GDPR export",
    apiPrefix: "/privacy/export",
    minRole: "authenticated user"
  }
] as const;
