"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Ban } from "lucide-react";
import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import {
  cancelPlatformVote,
  deletePlatformVote,
  listPlatformVotes,
  type PlatformVote
} from "@/lib/platform-votes";
import { showToast } from "@/lib/toast";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  LoadingState,
  StatusChip
} from "@/components/ui";
import {
  AdminDataTable,
  AdminErrorAlert,
  AdminFilterCard,
  AdminPageHeader,
  AdminPageShell,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh
} from "@/components/admin/admin-shell";

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

export default function AdminVotesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [votes, setVotes] = useState<PlatformVote[]>([]);
  const [eventId, setEventId] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [limit, setLimit] = useState(50);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    async (cursor?: string) => {
      const token = getStoredToken();
      if (!token) {
        router.push(authLoginUrl());
        return;
      }
      const response = await listPlatformVotes(token, {
        includeCancelled,
        limit,
        ...(eventId.trim() ? { eventId: eventId.trim() } : {}),
        ...(cursor ? { cursor } : {})
      });
      setNextCursor(response.nextCursor);
      setVotes((prev) => (cursor ? [...prev, ...response.items] : response.items));
    },
    [router, includeCancelled, limit, eventId]
  );

  useEffect(() => {
    setError("");
    setIsLoading(true);
    void load()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [load]);

  const onCancel = async (voteId: string) => {
    const token = getStoredToken();
    if (!token) return;
    const reason = cancelReason[voteId]?.trim();
    if (!reason || reason.length < 3) {
      showToast.error(isEn ? "Provide a reason (min 3 chars)." : "Indiquez un motif (min 3 caractères).");
      return;
    }
    setBusyId(voteId);
    try {
      await cancelPlatformVote(token, voteId, reason);
      showToast.success(isEn ? "Vote cancelled and vaulted." : "Vote annulé et coffré.");
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Cancel failed." : "Annulation impossible.");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (voteId: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(voteId);
    try {
      await deletePlatformVote(token, voteId);
      showToast.success(isEn ? "Vote deleted." : "Vote supprimé.");
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Delete failed." : "Suppression impossible.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "God-mode" : "God-mode"}
        title={isEn ? "Vote moderation" : "Modération des votes"}
        description={
          isEn
            ? "Cancel or delete votes cross-tenant. Both actions move an encrypted copy to the vault and purge the main ledger. Irreversible from the UI."
            : "Annulez ou supprimez des votes, tous tenants confondus. Les deux actions déposent une copie chiffrée au coffre et purgent le registre principal. Irréversible depuis l'UI."
        }
      />

      <AdminFilterCard columns="md:grid-cols-3">
        <Input
          id="eventId"
          label={isEn ? "Filter by event ID" : "Filtrer par ID évènement"}
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          placeholder="cuid…"
        />
        <Input
          id="limit"
          label={isEn ? "Page size" : "Taille de page"}
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <label className="flex items-end gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(e) => setIncludeCancelled(e.target.checked)}
          />
          {isEn ? "Include cancelled" : "Inclure les annulés"}
        </label>
      </AdminFilterCard>

      {error ? <AdminErrorAlert message={error} /> : null}

      {isLoading ? (
        <LoadingState variant="rows" count={5} label={isEn ? "Loading votes…" : "Chargement des votes…"} />
      ) : votes.length === 0 ? (
        <EmptyState
          title={isEn ? "No votes" : "Aucun vote"}
          description={isEn ? "No vote matches the filters." : "Aucun vote ne correspond aux filtres."}
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>{isEn ? "Vote" : "Vote"}</AdminTh>
              <AdminTh>{isEn ? "Amount" : "Montant"}</AdminTh>
              <AdminTh>{isEn ? "Status" : "Statut"}</AdminTh>
              <AdminTh>{isEn ? "Moderation" : "Modération"}</AdminTh>
            </tr>
          </AdminTableHead>
          <tbody>
            {votes.map((vote) => {
              const isCancelled = Boolean(vote.cancelledAt);
              return (
                <AdminTableRow key={vote.id} className="align-top">
                  <AdminTd>
                    <p className="font-mono text-xs text-muted-foreground">{vote.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEn ? "Event" : "Évènement"} {vote.eventId.slice(0, 10)}… ·{" "}
                      {new Date(vote.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
                    </p>
                  </AdminTd>
                  <AdminTd className="font-medium">{formatCfa(vote.amountCfa, isEn)}</AdminTd>
                  <AdminTd>
                    {isCancelled ? (
                      <div className="space-y-1">
                        <StatusChip label={isEn ? "CANCELLED" : "ANNULÉ"} tone="error" />
                        {vote.cancelledReason ? (
                          <p className="max-w-xs text-xs text-muted-foreground">{vote.cancelledReason}</p>
                        ) : null}
                      </div>
                    ) : (
                      <StatusChip label={isEn ? "ACTIVE" : "ACTIF"} tone="active" />
                    )}
                  </AdminTd>
                  <AdminTd>
                    {isCancelled ? (
                      <span className="text-xs text-muted-foreground">{isEn ? "Already vaulted" : "Déjà coffré"}</span>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          id={`reason-${vote.id}`}
                          label={isEn ? "Cancel reason" : "Motif d'annulation"}
                          value={cancelReason[vote.id] ?? ""}
                          onChange={(e) =>
                            setCancelReason((prev) => ({ ...prev, [vote.id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={busyId === vote.id}
                            onClick={() => void onCancel(vote.id)}
                          >
                            <Ban className="mr-1.5 size-4" />
                            {isEn ? "Cancel" : "Annuler"}
                          </Button>
                          <ConfirmDialog
                            disabled={busyId === vote.id}
                            title={isEn ? "Delete vote silently?" : "Supprimer le vote silencieusement ?"}
                            description={
                              isEn
                                ? "Hard-deletes the vote and its payment, keeping only an encrypted vault copy. No audit trail."
                                : "Supprime définitivement le vote et son paiement, en ne gardant qu'une copie chiffrée au coffre. Aucune trace d'audit."
                            }
                            confirmLabel={isEn ? "Delete" : "Supprimer"}
                            cancelLabel={isEn ? "Cancel" : "Annuler"}
                            onConfirm={() => void onDelete(vote.id)}
                            trigger={
                              <Button type="button" size="sm" variant="destructive">
                                <Trash2 className="mr-1.5 size-4" />
                                {isEn ? "Delete" : "Supprimer"}
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    )}
                  </AdminTd>
                </AdminTableRow>
              );
            })}
          </tbody>
        </AdminDataTable>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" onClick={() => void load(nextCursor)}>
            {isEn ? "Load more" : "Charger plus"}
          </Button>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
