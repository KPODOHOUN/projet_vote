"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  bulkDeleteAuditLogs,
  deleteAuditLog,
  deleteAuditLogsMatching,
  listAuditLogs,
  type AuditLog,
  type AuditLogFilters
} from "@/lib/audit-logs";
import { getStoredToken } from "@/lib/auth";
import { runDataPurge, type PurgeResult } from "@/lib/platform-maintenance";
import { showToast } from "@/lib/toast";
import { Button, ConfirmDialog, DataTable, EmptyState, Input, LoadingState, StatusChip } from "@/components/ui";
import type { DataTableColumn } from "@/components/ui";
import { AdminErrorAlert, AdminFilterCard, AdminSelect } from "@/components/admin/admin-shell";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, auditActionLabel, roleLabel, shortRef, targetTypeLabel } from "@/lib/admin-labels";

const PAGE_SIZES = [25, 50, 100] as const;

type AuditLogPanelProps = {
  isEn: boolean;
};

export function AuditLogPanel({ isEn }: AuditLogPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(50);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState("");
  const [filterTarget, setFilterTarget] = useState("");
  const [auditRetentionDays, setAuditRetentionDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);

  const filters = useMemo(
    (): AuditLogFilters => ({
      limit,
      action: filterAction,
      targetType: filterTarget
    }),
    [limit, filterAction, filterTarget]
  );

  const load = useCallback(
    async (cursor?: string) => {
      const token = getStoredToken();
      if (!token) return;
      const response = await listAuditLogs(token, { ...filters, ...(cursor ? { cursor } : {}) });
      setNextCursor(response.nextCursor);
      setLogs((prev) => (cursor ? [...prev, ...response.items] : response.items));
      if (!cursor) setSelected(new Set());
    },
    [filters]
  );

  useEffect(() => {
    setError("");
    setIsLoading(true);
    void load()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [load]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === logs.length ? new Set() : new Set(logs.map((l) => l.id))));
  };

  const onDeleteOne = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setIsBusy(true);
    try {
      await deleteAuditLog(token, id);
      showToast.success(isEn ? "Log entry deleted." : "Entrée supprimée.");
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Delete failed." : "Suppression impossible.");
    } finally {
      setIsBusy(false);
    }
  };

  const onDeleteSelected = async () => {
    const token = getStoredToken();
    if (!token || selected.size === 0) return;
    setIsBusy(true);
    try {
      const result = await bulkDeleteAuditLogs(token, [...selected]);
      showToast.success(
        isEn ? `${result.deleted} entries deleted.` : `${result.deleted} entrées supprimées.`
      );
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Delete failed." : "Suppression impossible.");
    } finally {
      setIsBusy(false);
    }
  };

  const onDeleteMatching = async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsBusy(true);
    try {
      const result = await deleteAuditLogsMatching(token, filters);
      showToast.success(
        isEn ? `${result.deleted} matching entries deleted.` : `${result.deleted} entrées filtrées supprimées.`
      );
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Delete failed." : "Suppression impossible.");
    } finally {
      setIsBusy(false);
    }
  };

  const onRetentionPurge = async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsBusy(true);
    setPurgeResult(null);
    try {
      const result = await runDataPurge(token, {
        auditLogsRetentionDays: auditRetentionDays,
        idempotencyRetentionDays: 30,
        revokedSessionsRetentionDays: 30
      });
      setPurgeResult(result);
      showToast.success(
        isEn
          ? `Clean-up done (${result.deletedAuditLogs} entries).`
          : `Nettoyage terminé (${result.deletedAuditLogs} entrées).`
      );
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Purge failed." : "Purge impossible.");
    } finally {
      setIsBusy(false);
    }
  };

  const logColumns: Array<DataTableColumn<AuditLog>> = [
    {
      key: "select",
      cardSlot: "action",
      header: (
        <input
          type="checkbox"
          checked={selected.size === logs.length && logs.length > 0}
          onChange={toggleAll}
          className="size-4 align-middle"
          aria-label={isEn ? "Select all" : "Tout sélectionner"}
        />
      ),
      render: (entry) => (
        <input
          type="checkbox"
          checked={selected.has(entry.id)}
          onChange={() => toggleOne(entry.id)}
          className="size-4 align-middle"
          aria-label={isEn ? "Select log" : "Sélectionner"}
        />
      )
    },
    {
      key: "date",
      header: isEn ? "Date" : "Date",
      render: (entry) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {new Date(entry.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
        </span>
      )
    },
    {
      key: "action",
      header: isEn ? "Action" : "Action",
      primary: true,
      render: (entry) => (
        <span className="font-medium">{auditActionLabel(entry.action, isEn)}</span>
      )
    },
    {
      key: "actor",
      header: isEn ? "By" : "Par",
      render: (entry) => (
        <div className="flex items-center gap-2">
          <StatusChip label={roleLabel(entry.actorRole, isEn)} tone="muted" />
          <span className="font-mono text-xs text-muted-foreground">{shortRef(entry.actorUserId)}</span>
        </div>
      )
    },
    {
      key: "target",
      header: isEn ? "Target" : "Cible",
      render: (entry) => (
        <span className="text-muted-foreground">
          {targetTypeLabel(entry.targetType, isEn)}
          {entry.targetId ? <span className="ml-1.5 font-mono text-xs">{shortRef(entry.targetId)}</span> : null}
        </span>
      )
    },
    {
      key: "delete",
      header: <span className="sr-only">{isEn ? "Delete" : "Supprimer"}</span>,
      align: "right",
      cardSlot: "action",
      render: (entry) => (
        <ConfirmDialog
          disabled={isBusy}
          title={isEn ? "Delete this log?" : "Supprimer cette entrée ?"}
          description={auditActionLabel(entry.action, isEn)}
          confirmLabel={isEn ? "Delete" : "Supprimer"}
          cancelLabel={isEn ? "Cancel" : "Annuler"}
          onConfirm={() => void onDeleteOne(entry.id)}
          trigger={
            <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={isEn ? "Delete entry" : "Supprimer l'entrée"}>
              <Trash2 className="size-4" />
            </Button>
          }
        />
      )
    }
  ];

  return (
    <div className="space-y-6">
      <AdminFilterCard columns="sm:grid-cols-2 lg:grid-cols-[1fr_1fr_10rem]">
        <AdminSelect
          id="filterAction"
          label={isEn ? "Action" : "Action"}
          value={filterAction}
          onChange={setFilterAction}
          options={[
            { value: "", label: isEn ? "All actions" : "Toutes les actions" },
            ...AUDIT_ACTIONS.map((a) => ({ value: a, label: auditActionLabel(a, isEn) }))
          ]}
        />
        <AdminSelect
          id="filterTarget"
          label={isEn ? "Concerns" : "Concerne"}
          value={filterTarget}
          onChange={setFilterTarget}
          options={[
            { value: "", label: isEn ? "Everything" : "Tout" },
            ...AUDIT_TARGET_TYPES.map((t) => ({ value: t, label: targetTypeLabel(t, isEn) }))
          ]}
        />
        <AdminSelect
          id="auditLimit"
          label={isEn ? "Rows" : "Lignes"}
          value={String(limit)}
          onChange={(v) => setLimit(Number(v))}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
        />
      </AdminFilterCard>

      {error ? <AdminErrorAlert message={error} /> : null}

      {logs.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {selected.size > 0
              ? isEn ? `${selected.size} selected` : `${selected.size} sélectionnée(s)`
              : isEn ? `${logs.length} entries shown` : `${logs.length} entrées affichées`}
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 ? (
              <Button type="button" size="sm" variant="destructive" disabled={isBusy} onClick={() => void onDeleteSelected()}>
                <Trash2 className="size-4" aria-hidden="true" />
                {isEn ? "Delete selection" : "Supprimer la sélection"}
              </Button>
            ) : null}
            {filterAction || filterTarget ? (
              <ConfirmDialog
                disabled={isBusy}
                title={isEn ? "Delete all filtered entries?" : "Supprimer toutes les entrées filtrées ?"}
                description={isEn ? "Every entry matching the filters. Cannot be undone." : "Toutes les entrées qui correspondent aux filtres. Irréversible."}
                confirmLabel={isEn ? "Delete" : "Supprimer"}
                cancelLabel={isEn ? "Cancel" : "Annuler"}
                onConfirm={() => void onDeleteMatching()}
                trigger={
                  <Button type="button" size="sm" variant="outline" disabled={isBusy}>
                    {isEn ? "Delete filtered" : "Supprimer le filtre"}
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <LoadingState variant="rows" count={5} label={isEn ? "Loading audit logs…" : "Chargement du journal…"} />
      ) : logs.length === 0 ? (
        <EmptyState
          title={isEn ? "No entries" : "Aucune entrée"}
          description={isEn ? "Nothing matches these filters." : "Rien ne correspond à ces filtres."}
        />
      ) : (
        <DataTable
          columns={logColumns}
          rows={logs}
          rowKey={(entry) => entry.id}
          emptyLabel={isEn ? "No entries" : "Aucune entrée"}
          ariaLabel={isEn ? "Audit log" : "Journal d'audit"}
        />
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" disabled={isBusy} onClick={() => void load(nextCursor)}>
            {isEn ? "Load more" : "Charger plus"}
          </Button>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="audit-cleanup">
        <h2 id="audit-cleanup" className="text-base font-bold">{isEn ? "Clean-up" : "Nettoyage"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEn ? "Delete entries older than:" : "Effacer les entrées de plus de :"}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-32">
            <Input
              id="auditRetention"
              label={isEn ? "Days" : "Jours"}
              type="number"
              min={0}
              max={3650}
              value={auditRetentionDays}
              onChange={(e) => setAuditRetentionDays(Number(e.target.value))}
            />
          </div>
          <ConfirmDialog
            disabled={isBusy}
            title={isEn ? "Delete old entries?" : "Effacer les anciennes entrées ?"}
            description={
              auditRetentionDays === 0
                ? isEn ? "Deletes every entry and expired sessions." : "Efface toutes les entrées et les sessions expirées."
                : isEn
                  ? `Entries older than ${auditRetentionDays} day(s), and expired sessions.`
                  : `Les entrées de plus de ${auditRetentionDays} jour(s), et les sessions expirées.`
            }
            confirmLabel={isEn ? "Delete" : "Effacer"}
            cancelLabel={isEn ? "Cancel" : "Annuler"}
            onConfirm={() => void onRetentionPurge()}
            trigger={
              <Button type="button" variant="outline" className="text-destructive hover:text-destructive" disabled={isBusy}>
                {isEn ? "Clean up" : "Effacer"}
              </Button>
            }
          />
        </div>
        {purgeResult ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {isEn
              ? `Last clean-up: ${purgeResult.deletedAuditLogs} entries, ${purgeResult.deletedRevokedSessions} sessions.`
              : `Dernier nettoyage : ${purgeResult.deletedAuditLogs} entrées, ${purgeResult.deletedRevokedSessions} sessions.`}
          </p>
        ) : null}
      </section>
    </div>
  );
}
