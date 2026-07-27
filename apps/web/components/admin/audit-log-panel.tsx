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
import { Button, ConfirmDialog, EmptyState, Input, LoadingState, StatusChip } from "@/components/ui";
import {
  AdminDataTable,
  AdminErrorAlert,
  AdminFilterCard,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh
} from "@/components/admin/admin-shell";

type AuditLogPanelProps = {
  isEn: boolean;
};

export function AuditLogPanel({ isEn }: AuditLogPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(50);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterTarget, setFilterTarget] = useState("");
  const [filterTenant, setFilterTenant] = useState("");
  const [auditRetentionDays, setAuditRetentionDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);

  const filters = useMemo(
    (): AuditLogFilters => ({
      limit,
      action: filterAction,
      actorUserId: filterActor,
      targetType: filterTarget,
      tenantId: filterTenant
    }),
    [limit, filterAction, filterActor, filterTarget, filterTenant]
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
          ? `Purge done (${result.deletedAuditLogs} audit logs).`
          : `Purge terminée (${result.deletedAuditLogs} logs).`
      );
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Purge failed." : "Purge impossible.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminFilterCard columns="md:grid-cols-2 lg:grid-cols-3">
        <Input
          id="auditLimit"
          label={isEn ? "Page size" : "Taille de page"}
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <Input
          id="filterAction"
          label={isEn ? "Action" : "Action"}
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          placeholder="maintenance.purge_executed"
        />
        <Input
          id="filterActor"
          label={isEn ? "Actor" : "Acteur"}
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
        />
        <Input
          id="filterTarget"
          label={isEn ? "Target type" : "Type de cible"}
          value={filterTarget}
          onChange={(e) => setFilterTarget(e.target.value)}
        />
        <Input
          id="filterTenant"
          label={isEn ? "Tenant ID" : "ID tenant"}
          value={filterTenant}
          onChange={(e) => setFilterTenant(e.target.value)}
        />
        <Input
          id="auditRetention"
          label={isEn ? "Retention purge (days, 0 = all)" : "Purge rétention (jours, 0 = tout)"}
          type="number"
          min={0}
          max={3650}
          value={auditRetentionDays}
          onChange={(e) => setAuditRetentionDays(Number(e.target.value))}
        />
      </AdminFilterCard>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={selected.size === 0 || isBusy} onClick={() => void onDeleteSelected()}>
          {isEn ? `Delete selected (${selected.size})` : `Supprimer la sélection (${selected.size})`}
        </Button>
        <ConfirmDialog
          disabled={isBusy}
          title={isEn ? "Delete matching logs?" : "Supprimer les logs filtrés ?"}
          description={
            isEn
              ? "Deletes every audit log matching the current filters. This cannot be undone."
              : "Supprime toutes les entrées correspondant aux filtres actuels. Irréversible."
          }
          confirmLabel={isEn ? "Delete matching" : "Supprimer le filtre"}
          cancelLabel={isEn ? "Cancel" : "Annuler"}
          onConfirm={() => void onDeleteMatching()}
          trigger={
            <Button type="button" variant="secondary" disabled={isBusy}>
              {isEn ? "Delete matching filter" : "Supprimer selon filtres"}
            </Button>
          }
        />
        <ConfirmDialog
          disabled={isBusy}
          title={isEn ? "Run retention purge?" : "Lancer la purge par rétention ?"}
          description={
            isEn
              ? `Deletes audit logs older than ${auditRetentionDays} day(s) plus expired technical data.`
              : `Supprime les logs plus vieux que ${auditRetentionDays} jour(s) et les données techniques expirées.`
          }
          confirmLabel={isEn ? "Run purge" : "Lancer la purge"}
          cancelLabel={isEn ? "Cancel" : "Annuler"}
          onConfirm={() => void onRetentionPurge()}
          trigger={
            <Button type="button" variant="destructive" disabled={isBusy}>
              {isEn ? "Purge by retention" : "Purger par rétention"}
            </Button>
          }
        />
      </div>

      {purgeResult ? (
        <p className="text-sm text-muted-foreground">
          {isEn ? "Last purge:" : "Dernière purge :"}{" "}
          {purgeResult.deletedAuditLogs} logs, {purgeResult.deletedIdempotencyKeys} idempotency,{" "}
          {purgeResult.deletedRevokedSessions} sessions
        </p>
      ) : null}

      {error ? <AdminErrorAlert message={error} /> : null}

      {isLoading ? (
        <LoadingState variant="rows" count={5} label={isEn ? "Loading audit logs…" : "Chargement du journal…"} />
      ) : logs.length === 0 ? (
        <EmptyState
          title={isEn ? "No audit logs" : "Aucun log"}
          description={isEn ? "No entries match your filters." : "Aucune entrée ne correspond aux filtres."}
        />
      ) : (
        <AdminDataTable minWidth="720px">
          <AdminTableHead>
            <tr>
              <AdminTh className="w-10">
                <input
                  type="checkbox"
                  checked={selected.size === logs.length && logs.length > 0}
                  onChange={toggleAll}
                  aria-label={isEn ? "Select all" : "Tout sélectionner"}
                />
              </AdminTh>
              <AdminTh>{isEn ? "Date" : "Date"}</AdminTh>
              <AdminTh>{isEn ? "Action" : "Action"}</AdminTh>
              <AdminTh>{isEn ? "Actor" : "Acteur"}</AdminTh>
              <AdminTh>{isEn ? "Target" : "Cible"}</AdminTh>
              <AdminTh />
            </tr>
          </AdminTableHead>
          <tbody>
            {logs.map((entry) => (
              <AdminTableRow key={entry.id}>
                <AdminTd>
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleOne(entry.id)}
                    aria-label={isEn ? "Select log" : "Sélectionner"}
                  />
                </AdminTd>
                <AdminTd className="whitespace-nowrap text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
                </AdminTd>
                <AdminTd>
                  <div className="flex items-center gap-2">
                    <StatusChip label={entry.actorRole} tone="muted" />
                    <span className="font-medium">{entry.action}</span>
                  </div>
                </AdminTd>
                <AdminTd className="text-muted-foreground">{entry.actorUserId}</AdminTd>
                <AdminTd className="text-muted-foreground">
                  {entry.targetType}
                  {entry.targetId ? ` · ${entry.targetId}` : ""}
                </AdminTd>
                <AdminTd className="text-right">
                  <ConfirmDialog
                    disabled={isBusy}
                    title={isEn ? "Delete this log?" : "Supprimer cette entrée ?"}
                    description={entry.action}
                    confirmLabel={isEn ? "Delete" : "Supprimer"}
                    cancelLabel={isEn ? "Cancel" : "Annuler"}
                    onConfirm={() => void onDeleteOne(entry.id)}
                    trigger={
                      <Button type="button" size="sm" variant="ghost" className="text-destructive">
                        <Trash2 className="size-4" />
                      </Button>
                    }
                  />
                </AdminTd>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" disabled={isBusy} onClick={() => void load(nextCursor)}>
            {isEn ? "Load more" : "Charger plus"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
