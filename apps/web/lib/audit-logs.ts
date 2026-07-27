import { apiFetch } from "./api";

export type AuditLog = {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogsResponse = {
  items: AuditLog[];
  nextCursor: string | null;
};

export type AuditLogFilters = {
  limit?: number;
  cursor?: string;
  action?: string;
  actorUserId?: string;
  targetType?: string;
  from?: string;
  to?: string;
  tenantId?: string;
};

function toSearchParams(filters: AuditLogFilters) {
  const params = new URLSearchParams();
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.action?.trim()) params.set("action", filters.action.trim());
  if (filters.actorUserId?.trim()) params.set("actorUserId", filters.actorUserId.trim());
  if (filters.targetType?.trim()) params.set("targetType", filters.targetType.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.tenantId?.trim()) params.set("tenantId", filters.tenantId.trim());
  return params;
}

export function listAuditLogs(token: string, filters: AuditLogFilters = {}) {
  const query = toSearchParams(filters).toString();
  return apiFetch<AuditLogsResponse>(`/admin/audit-logs${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function deleteAuditLog(token: string, id: string) {
  return apiFetch<{ deleted: boolean; id: string }>(`/admin/audit-logs/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function bulkDeleteAuditLogs(token: string, ids: string[]) {
  return apiFetch<{ deleted: number }>("/admin/audit-logs/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function deleteAuditLogsMatching(token: string, filters: Omit<AuditLogFilters, "limit" | "cursor">) {
  const body: Record<string, string> = {};
  if (filters.action?.trim()) body.action = filters.action.trim();
  if (filters.actorUserId?.trim()) body.actorUserId = filters.actorUserId.trim();
  if (filters.targetType?.trim()) body.targetType = filters.targetType.trim();
  if (filters.from) body.from = filters.from;
  if (filters.to) body.to = filters.to;
  if (filters.tenantId?.trim()) body.tenantId = filters.tenantId.trim();

  return apiFetch<{ deleted: number }>("/admin/audit-logs/delete-matching", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function deleteFeatureFlag(token: string, key: string, tenantId?: string) {
  const query = tenantId?.trim() ? `?tenantId=${encodeURIComponent(tenantId.trim())}` : "";
  return apiFetch<{ deleted: boolean; key: string }>(`/admin/feature-flags/${encodeURIComponent(key)}${query}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}
