"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { authedFetch, ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, DataTable, EmptyState, LoadingState, StatusChip } from "@/components/ui";
import type { DataTableColumn } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect
} from "@/components/admin/admin-shell";

type WithdrawalStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

type WithdrawalRow = {
  id: string;
  amountCfa: number;
  status: WithdrawalStatus;
  createdAt: string;
  processedAt: string | null;
  rejectReason: string | null;
  tenant: {
    id: string;
    slug: string;
    displayName: string;
    offerType: string;
  };
};

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
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    const data = await authedFetch<WithdrawalRow[]>(`/admin/offers/withdrawals${qs}`);
    setRows(data);
  }, [router, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    setError("");
    void load()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [load]);

  const runAction = async (id: string, action: "approve" | "reject" | "mark-paid") => {
    let body: string | undefined;
    if (action === "reject") {
      const reason = window.prompt(
        isEn ? "Rejection reason (required):" : "Motif du refus (obligatoire) :"
      );
      if (!reason || reason.trim().length < 3) {
        showToast.error(isEn ? "Reason required (min 3 chars)." : "Motif requis (min. 3 caractères).");
        return;
      }
      body = JSON.stringify({ reason: reason.trim() });
    }
    setBusyId(id);
    try {
      await authedFetch(`/admin/offers/withdrawals/${id}/${action}`, {
        method: "POST",
        ...(body ? { body } : {})
      });
      showToast.success(isEn ? "Updated." : "Mis à jour.");
      await load();
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
    return <LoadingState variant="rows" count={5} label={isEn ? "Loading withdrawals…" : "Chargement des retraits…"} />;
  }

  const withdrawalColumns: Array<DataTableColumn<WithdrawalRow>> = [
    {
      key: "tenant",
      header: isEn ? "Organizer" : "Organisation",
      render: (row) => (
        <div>
          <p className="font-semibold">{row.tenant.displayName}</p>
          <p className="text-xs text-muted-foreground">{row.tenant.slug}</p>
        </div>
      )
    },
    {
      key: "amount",
      header: isEn ? "Amount" : "Montant",
      align: "right",
      render: (row) => <span className="font-semibold">{formatCfa(row.amountCfa, isEn)}</span>
    },
    {
      key: "status",
      header: isEn ? "Status" : "Statut",
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
      header: isEn ? "Requested" : "Demandé le",
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
        </span>
      )
    },
    {
      key: "actions",
      header: isEn ? "Actions" : "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "PENDING" ? (
            <>
              <Button size="sm" loading={busyId === row.id} onClick={() => void runAction(row.id, "approve")}>
                {isEn ? "Approve" : "Approuver"}
              </Button>
              <Button size="sm" variant="secondary" loading={busyId === row.id} onClick={() => void runAction(row.id, "reject")}>
                {isEn ? "Reject" : "Refuser"}
              </Button>
            </>
          ) : null}
          {row.status === "APPROVED" ? (
            <Button size="sm" loading={busyId === row.id} onClick={() => void runAction(row.id, "mark-paid")}>
              {isEn ? "Mark paid (demo)" : "Marquer payé (démo)"}
            </Button>
          ) : null}
        </div>
      )
    }
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Offers" : "Offres"}
        title={isEn ? "Withdrawals" : "Retraits"}
        description={
          isEn
            ? "Approve, reject or mark escrow withdrawals as paid."
            : "Approuver, refuser ou marquer les retraits escrow comme payés."
        }
      />

      <div className="max-w-xs">
        <AdminSelect
          id="statusFilter"
          label={isEn ? "Status" : "Statut"}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: isEn ? "All" : "Tous" },
            { value: "PENDING", label: isEn ? "Pending" : "En attente" },
            { value: "APPROVED", label: isEn ? "Approved" : "Approuvés" },
            { value: "REJECTED", label: isEn ? "Rejected" : "Refusés" },
            { value: "PAID", label: isEn ? "Paid" : "Payés" }
          ]}
        />
      </div>

      {error ? <AdminErrorAlert message={error} /> : null}

      {!error && rows.length === 0 ? (
        <EmptyState
          title={isEn ? "No withdrawals" : "Aucun retrait"}
          description={isEn ? "Withdrawal requests will appear here." : "Les demandes de retrait apparaîtront ici."}
        />
      ) : null}

      {rows.length > 0 ? (
        <DataTable
          columns={withdrawalColumns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyLabel={isEn ? "No withdrawals" : "Aucun retrait"}
          ariaLabel={isEn ? "Withdrawals" : "Retraits"}
        />
      ) : null}
    </AdminPageShell>
  );
}
