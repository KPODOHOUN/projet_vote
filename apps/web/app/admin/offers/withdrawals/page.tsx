"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import {
  useAdminWithdrawalsQuery,
  useAdminWithdrawalActionMutation,
  revealWithdrawalDestination,
  type WithdrawalRow,
  type WithdrawalStatus
} from "@/lib/hooks/use-admin-withdrawals";
import { Button, ConfirmDialog, DataTable, EmptyState, LoadingState, StatusChip } from "@/components/ui";
import type { MessageKey } from "@/lib/i18n";
import type { DataTableColumn } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect
} from "@/components/admin/admin-shell";

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

function statusTone(status: WithdrawalStatus): "pending" | "warning" | "success" | "error" | "live" | "muted" {
  switch (status) {
    case "PENDING":
      return "pending";
    case "APPROVED":
      return "live";
    case "PAID":
      return "success";
    case "REJECTED":
      return "error";
    default:
      return "muted";
  }
}

function statusLabelKey(status: WithdrawalStatus): MessageKey {
  return `withdrawal.status.${status}` as MessageKey;
}

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) {
      router.push(authLoginUrl());
    }
  }, [hasToken, router]);

  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Numéros révélés (consultation journalisée côté API), en mémoire seulement.
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const reveal = async (row: WithdrawalRow) => {
    try {
      const destination = await revealWithdrawalDestination(row.id);
      setRevealed((prev) => ({ ...prev, [row.id]: `${destination.network} ${destination.phone}` }));
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Could not show the number." : "Numéro indisponible.");
    }
  };
  const [rejectReason, setRejectReason] = useState("");

  const withdrawalsQuery = useAdminWithdrawalsQuery(statusFilter, hasToken);
  const actionMutation = useAdminWithdrawalActionMutation();

  const rows = withdrawalsQuery.data ?? [];
  const isLoading = withdrawalsQuery.isPending;
  const error = withdrawalsQuery.isError
    ? withdrawalsQuery.error instanceof Error
      ? withdrawalsQuery.error.message
      : t("admin.withdrawals.actionFailed")
    : null;

  const runAction = async (id: string, action: "approve" | "reject" | "mark-paid", reason?: string) => {
    setBusyId(id);
    try {
      await actionMutation.mutateAsync({ id, action, ...(reason ? { reason } : {}) });
      showToast.success(t("admin.withdrawals.updated"));
    } catch (caught) {
      showToast.error(
        caught instanceof ApiError || caught instanceof Error ? caught.message : t("admin.withdrawals.actionFailed")
      );
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (row: WithdrawalRow) => {
    const busy = busyId === row.id && actionMutation.isPending;
    const trimmedReason = rejectReason.trim();
    return (
      <div className="flex flex-wrap gap-2">
        {row.status === "PENDING" ? (
          <>
            <Button size="sm" variant="secondary" className="min-h-11" loading={busy} onClick={() => void runAction(row.id, "approve")}>
              {t("admin.withdrawals.approve")}
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost" className="min-h-11" disabled={busy}>
                  {t("admin.withdrawals.reject")}
                </Button>
              }
              onOpenChange={(open) => {
                if (open) setRejectReason("");
              }}
              title={t("admin.withdrawals.rejectTitle")}
              description={t("admin.withdrawals.rejectDesc")}
              confirmLabel={t("admin.withdrawals.reject")}
              cancelLabel={t("admin.withdrawals.cancel")}
              variant="destructive"
              confirmDisabled={trimmedReason.length < 3}
              onConfirm={() => runAction(row.id, "reject", trimmedReason)}
            >
              <label htmlFor={`reject-${row.id}`} className="block text-sm font-medium text-foreground">
                {t("admin.withdrawals.rejectReasonLabel")}
              </label>
              <textarea
                id={`reject-${row.id}`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </ConfirmDialog>
          </>
        ) : null}
        {row.status === "APPROVED" ? (
          revealed[row.id] ? (
            <span className="inline-flex min-h-11 items-center rounded-md bg-muted px-3 font-mono text-sm">{revealed[row.id]}</span>
          ) : (
            <Button size="sm" variant="secondary" className="min-h-11" onClick={() => void reveal(row)}>
              {isEn ? "Show the number to pay" : "Voir le numéro à créditer"}
            </Button>
          )
        ) : null}
        {row.status === "APPROVED" ? (
          <ConfirmDialog
            trigger={
              <Button size="sm" className="min-h-11" loading={busy}>
                {t("admin.withdrawals.markPaid")}
              </Button>
            }
            title={t("admin.withdrawals.markPaidTitle")}
            description={t("admin.withdrawals.markPaidDesc", {
              amount: formatCfa(row.amountCfa, isEn),
              org: row.tenant.displayName
            })}
            confirmLabel={t("admin.withdrawals.markPaidConfirm")}
            cancelLabel={t("admin.withdrawals.cancel")}
            variant="default"
            onConfirm={() => runAction(row.id, "mark-paid")}
          />
        ) : null}
      </div>
    );
  };

  const renderStatus = (row: WithdrawalRow) => (
    <div>
      <StatusChip label={t(statusLabelKey(row.status))} tone={statusTone(row.status)} />
      {row.rejectReason ? <p className="mt-1 text-xs text-muted-foreground">{row.rejectReason}</p> : null}
    </div>
  );

  if (isLoading) {
    return <LoadingState variant="rows" count={5} label={t("admin.withdrawals.loading")} />;
  }

  const withdrawalColumns: Array<DataTableColumn<WithdrawalRow>> = [
    {
      key: "tenant",
      header: t("admin.withdrawals.colOrganizer"),
      render: (row) => (
        <div>
          <p className="font-semibold">{row.tenant.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {row.payoutNetwork && row.payoutPhoneLast4
              ? `${isEn ? "To" : "Vers"} ${row.payoutNetwork} ···· ${row.payoutPhoneLast4}`
              : isEn ? "No number recorded" : "Aucun numéro enregistré"}
          </p>
        </div>
      )
    },
    {
      key: "amount",
      header: t("admin.withdrawals.colAmount"),
      align: "right",
      render: (row) => <span className="font-semibold tabular-nums">{formatCfa(row.amountCfa, isEn)}</span>
    },
    {
      key: "status",
      header: t("admin.withdrawals.colStatus"),
      render: renderStatus
    },
    {
      key: "createdAt",
      header: t("admin.withdrawals.colRequested"),
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
        </span>
      )
    },
    {
      key: "actions",
      header: t("admin.withdrawals.colActions"),
      render: renderActions
    }
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={t("admin.withdrawals.eyebrow")}
        title={t("admin.withdrawals.title")}
        description={t("admin.withdrawals.desc")}
      />

      <div className="max-w-xs">
        <AdminSelect
          id="statusFilter"
          label={t("admin.withdrawals.filterStatus")}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: t("admin.withdrawals.all") },
            { value: "PENDING", label: t("admin.withdrawals.pending") },
            { value: "APPROVED", label: t("admin.withdrawals.approved") },
            { value: "REJECTED", label: t("admin.withdrawals.rejected") },
            { value: "PAID", label: t("admin.withdrawals.paid") }
          ]}
        />
      </div>

      <p className="max-w-2xl border-l-2 border-border pl-3 text-sm font-medium text-foreground">
        {t("admin.withdrawals.manualNotice")}
      </p>

      {error ? <AdminErrorAlert message={error} /> : null}

      {!error && rows.length === 0 ? (
        <EmptyState
          title={t("admin.withdrawals.empty")}
          description={t("admin.withdrawals.emptyDesc")}
        />
      ) : null}

      {rows.length > 0 ? (
        <>
          {/* Sous 768 px : une carte par demande, jamais de défilement horizontal. */}
          <ul className="space-y-3 md:hidden" aria-label={t("admin.withdrawals.title")}>
            {rows.map((row) => (
              <li key={row.id} className="space-y-3 rounded-md border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.tenant.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{formatCfa(row.amountCfa, isEn)}</p>
                </div>
                {renderStatus(row)}
                {renderActions(row)}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <DataTable
              columns={withdrawalColumns}
              rows={rows}
              rowKey={(row) => row.id}
              emptyLabel={t("admin.withdrawals.empty")}
              ariaLabel={t("admin.withdrawals.title")}
            />
          </div>
        </>
      ) : null}
    </AdminPageShell>
  );
}
