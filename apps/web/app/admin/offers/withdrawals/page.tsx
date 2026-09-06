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
  type WithdrawalRow,
  type WithdrawalStatus
} from "@/lib/hooks/use-admin-withdrawals";
import { Button, DataTable, EmptyState, LoadingState, StatusChip } from "@/components/ui";
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

  const withdrawalsQuery = useAdminWithdrawalsQuery(statusFilter, hasToken);
  const actionMutation = useAdminWithdrawalActionMutation();

  const rows = withdrawalsQuery.data ?? [];
  const isLoading = withdrawalsQuery.isPending;
  const error = withdrawalsQuery.isError
    ? withdrawalsQuery.error instanceof Error
      ? withdrawalsQuery.error.message
      : "Erreur"
    : null;

  const runAction = async (id: string, action: "approve" | "reject" | "mark-paid") => {
    let reason: string | undefined;
    if (action === "reject") {
      const promptReason = window.prompt(
        isEn ? "Rejection reason (required):" : "Motif du refus (obligatoire) :"
      );
      if (!promptReason || promptReason.trim().length < 3) {
        showToast.error(isEn ? "Reason required (min 3 chars)." : "Motif requis (min. 3 caractères).");
        return;
      }
      reason = promptReason.trim();
    }
    setBusyId(id);
    try {
      await actionMutation.mutateAsync({ id, action, ...(reason ? { reason } : {}) });
      showToast.success(isEn ? "Updated." : "Mis à jour.");
    } catch (caught) {
      showToast.error(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : isEn
              ? "Action failed."
              : "Action impossible."
      );
    } finally {
      setBusyId(null);
    }
  };

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
          <p className="text-xs text-muted-foreground">{row.tenant.slug}</p>
        </div>
      )
    },
    {
      key: "amount",
      header: t("admin.withdrawals.colAmount"),
      align: "right",
      render: (row) => <span className="font-semibold">{formatCfa(row.amountCfa, isEn)}</span>
    },
    {
      key: "status",
      header: t("admin.withdrawals.colStatus"),
      render: (row) => (
        <div>
          <StatusChip label={row.status} tone={statusTone(row.status)} />
          {row.rejectReason ? (
            <p className="mt-1 text-xs text-muted-foreground">{row.rejectReason}</p>
          ) : null}
        </div>
      )
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
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "PENDING" ? (
            <>
              <Button size="sm" loading={busyId === row.id && actionMutation.isPending} onClick={() => void runAction(row.id, "approve")}>
                {t("admin.withdrawals.approve")}
              </Button>
              <Button size="sm" variant="secondary" loading={busyId === row.id && actionMutation.isPending} onClick={() => void runAction(row.id, "reject")}>
                {t("admin.withdrawals.reject")}
              </Button>
            </>
          ) : null}
          {row.status === "APPROVED" ? (
            <Button size="sm" loading={busyId === row.id && actionMutation.isPending} onClick={() => void runAction(row.id, "mark-paid")}>
              {t("admin.withdrawals.markPaid")}
            </Button>
          ) : null}
        </div>
      )
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

      {error ? <AdminErrorAlert message={error} /> : null}

      {!error && rows.length === 0 ? (
        <EmptyState
          title={t("admin.withdrawals.empty")}
          description={t("admin.withdrawals.emptyDesc")}
        />
      ) : null}

      {rows.length > 0 ? (
        <DataTable
          columns={withdrawalColumns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyLabel={t("admin.withdrawals.empty")}
          ariaLabel={t("admin.withdrawals.title")}
        />
      ) : null}
    </AdminPageShell>
  );
}
