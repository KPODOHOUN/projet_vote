"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import { KpiCard, LoadingState } from "@/components/ui";
import { InternalCapabilitiesPanel } from "@/components/admin/internal-capabilities-panel";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-shell";
import { pendingPartnerRequestCount } from "../../lib/partners";

type JobsOverview = {
  pendingPayments: number;
  failedPayments24h: number;
  expiredIdempotencyKeys: number;
};

export default function AdminHomePage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [jobs, setJobs] = useState<JobsOverview | null>(null);
  const [partnerPending, setPartnerPending] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }
    void Promise.all([
      apiFetch<JobsOverview>("/admin/jobs/overview", { headers: { Authorization: `Bearer ${token}` } }),
      pendingPartnerRequestCount(token)
    ])
      .then(([overview, partners]) => {
        setJobs(overview);
        setPartnerPending(partners.count);
      })
      .catch((err) => {
        setJobs(null);
        setFetchError(err instanceof Error ? err.message : "Erreur de chargement");
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <LoadingState variant="kpi" count={4} label={isEn ? "Loading admin overview…" : "Chargement de l'administration…"} />;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Platform" : "Plateforme"}
        title={isEn ? "Platform administration" : "Administration plateforme"}
        description={
          isEn
            ? "Supervise organizers, revenue, partners and platform health from this dedicated space."
            : "Supervisez les organisateurs, les revenus, les partenaires et la santé de la plateforme depuis cet espace dédié."
        }
      />

      {fetchError && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm">
          {fetchError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={isEn ? "Pending payments" : "Paiements en attente"} value={String(jobs?.pendingPayments ?? "—")} />
        <KpiCard label={isEn ? "Failed (24h)" : "Échecs (24h)"} value={String(jobs?.failedPayments24h ?? "—")} />
        <KpiCard label={isEn ? "Partner requests" : "Demandes partenaires"} value={String(partnerPending)} />
        <KpiCard
          label={isEn ? "Expired idempotency keys" : "Clés idempotence expirées"}
          value={String(jobs?.expiredIdempotencyKeys ?? "—")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { href: "/admin/users", label: isEn ? "Users" : "Utilisateurs" },
          { href: "/admin/subscriptions", label: isEn ? "Revenue" : "Revenus" },
          { href: "/admin/payouts", label: isEn ? "Payouts" : "Versements" },
          { href: "/admin/votes", label: isEn ? "Vote moderation" : "Modération votes" },
          { href: "/admin/partners", label: isEn ? "Partners" : "Partenaires" },
          { href: "/admin/settings", label: isEn ? "Settings" : "Réglages" },
          { href: "/admin/jobs", label: isEn ? "Jobs" : "Jobs" },
          { href: "/admin/maintenance", label: isEn ? "Maintenance" : "Maintenance" },
          { href: "/admin/audit", label: isEn ? "Audit log" : "Journal d'audit" }
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-border bg-card p-5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/10 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] active:opacity-80 cursor-pointer"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <InternalCapabilitiesPanel />
    </AdminPageShell>
  );
}
