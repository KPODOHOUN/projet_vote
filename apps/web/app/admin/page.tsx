"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import { FormError, LoadingState } from "@/components/ui";
import { InternalCapabilitiesPanel } from "@/components/admin/internal-capabilities-panel";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-shell";
import { fetchMaintenanceMode } from "../../lib/platform-maintenance";

type JobsOverview = { pendingPayments: number; failedPayments24h: number; expiredIdempotencyKeys: number };
type LedgerSummary = { walletsChecked: number; driftCount: number; unverifiableCount: number; unknownEntries: number };

type Overview = {
  pendingWithdrawals: number | null;
  activeEscrowEvents: number | null;
  ledger: LedgerSummary | null;
  maintenance: boolean | null;
  jobs: JobsOverview | null;
};

/**
 * Vue d'ensemble admin (7.8) : un chiffre dominant (retraits à traiter), le
 * reste en lignes cliquables. Chaque valeur vient d'une route existante ; une
 * route en échec affiche « — », jamais un chiffre inventé.
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
        activeEscrowEvents: events.status === "fulfilled" ? events.value.length : null,
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
  const row = "flex min-h-11 items-center border-b border-border py-2 text-sm text-slate-900 hover:bg-accent/40";

  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow="SHADOMA" title={t("adminHome.title")} />

      {partialError ? <FormError>{t("adminHome.loadFailed")}</FormError> : null}

      <section className="grid gap-8 md:grid-cols-[3fr_2fr]">
        <Link href="/admin/offers/withdrawals?status=PENDING" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p className="text-sm text-slate-600">{t("adminHome.pending")}</p>
          <p className="mt-1 text-4xl font-extrabold text-slate-900 tabular-nums">{dash(data.pendingWithdrawals)}</p>
          {data.pendingWithdrawals === 0 ? <p className="mt-1 text-sm text-slate-600">{t("adminHome.pendingNone")}</p> : null}
        </Link>

        <ul className="border-t border-border">
          <li>
            <Link href="/admin/offers/events" className={row}>
              {t("adminHome.activeEvents", { count: dash(data.activeEscrowEvents) })}
            </Link>
          </li>
          <li>
            <Link href="/admin/offers" className={row}>
              {data.ledger === null
                ? "—"
                : data.ledger.driftCount > 0
                  ? <span className="font-semibold text-[var(--color-error-text)]">{t("adminHome.ledgerDrift", { count: data.ledger.driftCount })}</span>
                  : t("adminHome.ledgerOk", { count: data.ledger.walletsChecked })}
            </Link>
          </li>
          {data.ledger && data.ledger.unknownEntries > 0 ? (
            <li className="border-b border-border py-2 text-sm text-slate-600">
              {t("adminHome.ledgerUnknown", { count: data.ledger.unknownEntries })}
            </li>
          ) : null}
          <li>
            <Link href="/admin/maintenance" className={row}>
              {data.maintenance === null ? "—" : data.maintenance ? t("adminHome.maintenanceOn") : t("adminHome.maintenanceOff")}
            </Link>
          </li>
          <li>
            <Link href="/admin/jobs" className={row}>
              {t("adminHome.pendingPayments", { count: dash(data.jobs?.pendingPayments) })}
            </Link>
          </li>
          <li>
            <Link href="/admin/jobs" className={row}>
              {t("adminHome.failedPayments", { count: dash(data.jobs?.failedPayments24h) })}
            </Link>
          </li>
        </ul>
      </section>

      <InternalCapabilitiesPanel />
    </AdminPageShell>
  );
}
