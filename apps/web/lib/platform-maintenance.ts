import { apiFetch } from "./api";

export type MaintenanceStatus = {
  enabled: boolean;
  message: string;
};

export function fetchMaintenanceStatus() {
  return apiFetch<MaintenanceStatus>("/maintenance/status");
}

export function fetchMaintenanceMode(token: string) {
  return apiFetch<MaintenanceStatus>("/admin/maintenance/mode", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function updateMaintenanceMode(
  token: string,
  payload: { enabled: boolean; message?: string }
) {
  return apiFetch<MaintenanceStatus>("/admin/maintenance/mode", {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` }
  });
}

export type PurgeResult = {
  deletedAuditLogs: number;
  deletedIdempotencyKeys: number;
  deletedRevokedSessions: number;
  deletedLoginAttempts: number;
};

export function runDataPurge(
  token: string,
  payload: {
    auditLogsRetentionDays: number;
    idempotencyRetentionDays: number;
    revokedSessionsRetentionDays: number;
  }
) {
  return apiFetch<PurgeResult>("/admin/maintenance/purge", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` }
  });
}
