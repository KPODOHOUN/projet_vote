"use client";

import { useI18n } from "@/lib/i18n-provider";
import { AuditLogPanel } from "@/components/admin/audit-log-panel";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-shell";

export default function AdminAuditPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "System" : "Système"}
        title={isEn ? "Audit log" : "Journal d'audit"}
        description={
          isEn
            ? "Inspect, filter and delete audit entries. Use retention purge for bulk cleanup of old logs."
            : "Consultez, filtrez et supprimez les entrées d'audit. Utilisez la purge par rétention pour nettoyer les anciens logs."
        }
      />
      <AuditLogPanel isEn={isEn} />
    </AdminPageShell>
  );
}
