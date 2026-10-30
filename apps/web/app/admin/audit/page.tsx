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
        description={isEn ? "Who did what, and when." : "Qui a fait quoi, et quand."}
      />
      <AuditLogPanel isEn={isEn} />
    </AdminPageShell>
  );
}
