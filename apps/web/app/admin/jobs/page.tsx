"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { KpiCard, StatusChip, EmptyState, LoadingState } from "@/components/ui";
import { AdminErrorAlert, AdminPageHeader, AdminPageShell, AdminSection } from "@/components/admin/admin-shell";

type JobsOverviewResponse = {
  pendingPayments: number;
  stalePendingPayments: number;
  failedPayments24h: number;
  expiredIdempotencyKeys: number;
  revokedSessionsToPurge: number;
  recentMaintenanceRuns: Array<{
    id: string;
    action: string;
    createdAt: string;
    actorUserId: string;
  }>;
};

export default function DashboardAdminJobsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [overview, setOverview] = useState<JobsOverviewResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setError("");
    setIsLoading(true);

    void (async () => {
      try {
        const response = await apiFetch<JobsOverviewResponse>("/admin/jobs/overview", {
          headers: { Authorization: `Bearer ${token}` }
        });
        setOverview(response);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : isEn ? "Unable to load jobs center." : "Chargement du centre de tâches impossible.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router, isEn]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "System" : "Système"}
        title={isEn ? "Jobs center" : "Centre de tâches"}
        description={
          isEn
            ? "Monitor pending payments, failed transactions and maintenance runs."
            : "Surveillez les paiements en attente, les échecs et les exécutions de maintenance."
        }
      />

      {isLoading ? (
        <LoadingState variant="rows" count={4} label={isEn ? "Loading jobs center…" : "Chargement du centre de tâches…"} />
      ) : error ? (
        <AdminErrorAlert message={error} />
      ) : !overview ? (
        <p className="text-muted-foreground">
          {isEn ? "No jobs data available." : "Aucune donnée de tâches disponible."}
        </p>
      ) : (
        <div className="space-y-10">
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              label={isEn ? "Pending payments" : "Paiements en attente"}
              value={String(overview.pendingPayments)}
            />
            <KpiCard
              label={isEn ? "Stalled (> 15 min)" : "Bloqués (> 15 min)"}
              value={String(overview.stalePendingPayments)}
            />
            <KpiCard
              label={isEn ? "Failed (24 h)" : "Échoués (24 h)"}
              value={String(overview.failedPayments24h)}
            />
            <KpiCard
              label={isEn ? "Expired idempotency" : "Idempotence expirée"}
              value={String(overview.expiredIdempotencyKeys)}
            />
            <KpiCard
              label={isEn ? "Sessions to purge" : "Sessions à purger"}
              value={String(overview.revokedSessionsToPurge)}
            />
          </section>

          <AdminSection title={isEn ? "Latest maintenance runs" : "Dernières exécutions de maintenance"}>
            {overview.recentMaintenanceRuns.length === 0 ? (
              <EmptyState
                title={isEn ? "No recent run" : "Aucune exécution"}
                description={isEn ? "No recent maintenance run." : "Aucune exécution de maintenance récente."}
              />
            ) : (
              <ul className="space-y-3">
                {overview.recentMaintenanceRuns.map((run) => (
                  <li
                    key={run.id}
                    className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <StatusChip label={run.action} tone="live" />
                      <strong className="text-foreground">{run.actorUserId}</strong>
                      <span className="text-sm text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </div>
      )}
    </AdminPageShell>
  );
}
