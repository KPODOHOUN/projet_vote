"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import { FormError, LoadingState } from "@/components/ui";
import { AdminPageHeader, AdminPageShell, AdminStatGrid, AdminStatTile } from "@/components/admin/admin-shell";
import { fetchMaintenanceMode } from "../../lib/platform-maintenance";

type JobsOverview = { pendingPayments: number; failedPayments24h: number; expiredIdempotencyKeys: number; lateSuccessToRefund: number };
type LedgerSummary = { walletsChecked: number; driftCount: number; unverifiableCount: number; unknownEntries: number };

type Overview = {
  pendingWithdrawals: number | null;
  activeEvents: number | null;
  ledger: LedgerSummary | null;
  maintenance: boolean | null;
  jobs: JobsOverview | null;
};

/**
 * Vue d'ensemble admin : six tuiles de même taille, chacune mène à la page qui
 * traite le sujet. Chaque valeur vient d'une route existante ; une route en
 * échec affiche « — », jamais un chiffre inventé.
 */
export default function AdminHomePage() {
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [partialError, setPartialError] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    void Promise.allSettled([
      apiFetch<unknown[]>("/admin/offers/withdrawals?status=PENDING", { headers }),
      apiFetch<unknown[]>("/admin/offers/events/active", { headers }),
      apiFetch<LedgerSummary>("/admin/offers/ledger-reconciliation", { headers }),
      fetchMaintenanceMode(token),
      apiFetch<JobsOverview>("/admin/jobs/overview", { headers })
    ]).then(([withdrawals, events, ledger, maintenance, jobs]) => {
      setPartialError([withdrawals, events, ledger, maintenance, jobs].some((r) => r.status === "rejected"));
      setData({
        pendingWithdrawals: withdrawals.status === "fulfilled" ? withdrawals.value.length : null,
        activeEvents: events.status === "fulfilled" ? events.value.length : null,
        ledger: ledger.status === "fulfilled" ? ledger.value : null,
        maintenance: maintenance.status === "fulfilled" ? maintenance.value.enabled : null,
        jobs: jobs.status === "fulfilled" ? jobs.value : null
      });
    });
  }, []);

  if (!data) {
    return <LoadingState variant="rows" count={4} label={t("adminHome.title")} />;
  }

  const dash = (value: number | null | undefined) => (value == null ? "—" : String(value));
  const pending = data.pendingWithdrawals;
  const failed = data.jobs?.failedPayments24h;
  const toRefund = data.jobs?.lateSuccessToRefund;
  const ledger = data.ledger;

  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow={t("adminHome.eyebrow")} title={t("adminHome.title")} />

      {partialError ? <FormError>{t("adminHome.loadFailed")}</FormError> : null}

      {/* Argent à rendre : bandeau seulement quand il y en a, la grille garde ses 6 tuiles. */}
      {toRefund ? (
        <Link
          href="/admin/audit?action=payment.late_success_needs_refund"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="space-y-0.5">
            <span className="block font-bold text-destructive">{t("adminHome.lateRefunds")} : {toRefund}</span>
            <span className="block text-muted-foreground">{t("adminHome.lateRefundsHint")}</span>
          </span>
          <span className="font-semibold text-destructive">{t("adminHome.lateRefundsOpen")}</span>
        </Link>
      ) : null}

      <AdminStatGrid>
        <AdminStatTile
          href="/admin/offers/withdrawals?status=PENDING"
          label={t("adminHome.pending")}
          value={dash(pending)}
          tone={pending ? "alert" : pending === 0 ? "ok" : "neutral"}
          {...(pending === 0 ? { hint: t("adminHome.pendingNone") } : {})}
        />
        <AdminStatTile
          href="/admin/offers/events"
          label={t("adminHome.activeEvents")}
          value={dash(data.activeEvents)}
        />
        <AdminStatTile
          href="/admin/jobs"
          label={t("adminHome.pendingPayments")}
          value={dash(data.jobs?.pendingPayments)}
        />
        <AdminStatTile
          href="/admin/jobs"
          label={t("adminHome.failedPayments")}
          value={dash(failed)}
          tone={failed ? "alert" : failed === 0 ? "ok" : "neutral"}
          {...(failed === 0 ? { hint: t("adminHome.allGood") } : {})}
        />
        <AdminStatTile
          href="/admin/offers"
          label={t("adminHome.ledger")}
          value={ledger ? (ledger.driftCount > 0 ? String(ledger.driftCount) : t("adminHome.ledgerOkShort")) : "—"}
          tone={ledger ? (ledger.driftCount > 0 ? "alert" : "ok") : "neutral"}
          {...(ledger
            ? {
                hint:
                  ledger.driftCount > 0
                    ? t("adminHome.ledgerDrift", { count: ledger.driftCount })
                    : ledger.unknownEntries > 0
                      ? t("adminHome.ledgerUnknown", { count: ledger.unknownEntries })
                      : t("adminHome.ledgerOk", { count: ledger.walletsChecked })
              }
            : {})}
        />
        <AdminStatTile
          href="/admin/maintenance"
          label={t("adminHome.maintenance")}
          value={data.maintenance === null ? "—" : data.maintenance ? t("adminHome.maintenanceOn") : t("adminHome.maintenanceOff")}
          tone={data.maintenance ? "alert" : "neutral"}
          {...(data.maintenance === null
            ? {}
            : { hint: data.maintenance ? t("adminHome.maintenanceOnHint") : t("adminHome.maintenanceOffHint") })}
        />
      </AdminStatGrid>
    </AdminPageShell>
  );
}
