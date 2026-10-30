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
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  StatusChip
} from "@/components/ui";
import type { DataTableColumn } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminFilterCard,
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

export default function AdminVotesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [votes, setVotes] = useState<PlatformVote[]>([]);
  const [eventId, setEventId] = useState("");
  // Événements déjà vus dans les votes chargés : alimente le filtre par nom.
  const [knownEvents, setKnownEvents] = useState<Record<string, string>>({});
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [limit, setLimit] = useState(50);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
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
      setKnownEvents((prev) => {
        const next = { ...prev };
        for (const vote of response.items) next[vote.eventId] = vote.event.title;
        return next;
      });
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
    const reason = cancelReason.trim();
    if (reason.length < 3) return;
    setBusyId(voteId);
    try {
      await cancelPlatformVote(token, voteId, reason);
      showToast.success(isEn ? "Vote cancelled." : "Vote annulé.");
      setCancelReason("");
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

  const eventOptions = Object.entries(knownEvents)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const voteColumns: Array<DataTableColumn<PlatformVote>> = [
    {
      key: "vote",
      header: isEn ? "Candidate" : "Candidat",
      primary: true,
      render: (vote) => (
        <div>
          <p className="font-medium text-foreground">
            {vote.candidate.fullName}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">n° {vote.candidate.number}</span>
          </p>
          <p className="text-xs font-normal text-muted-foreground">
            {vote.event.title} · {new Date(vote.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
      )
    },
    {
      key: "amount",
      header: isEn ? "Amount" : "Montant",
      align: "right",
      render: (vote) => <span className="font-medium">{formatCfa(vote.amountCfa, isEn)}</span>
    },
    {
      key: "status",
      header: isEn ? "Status" : "Statut",
      render: (vote) =>
        vote.cancelledAt ? (
          <div className="space-y-1">
            <StatusChip label={isEn ? "Cancelled" : "Annulé"} tone="error" />
            {vote.cancelledReason ? (
              <p className="max-w-xs text-xs text-muted-foreground">{vote.cancelledReason}</p>
            ) : null}
          </div>
        ) : (
          <StatusChip label={isEn ? "Valid" : "Valide"} tone="active" />
        )
    },
    {
      key: "actions",
      header: <span className="sr-only">{isEn ? "Actions" : "Actions"}</span>,
      align: "right",
      cardSlot: "action",
      render: (vote) =>
        vote.cancelledAt ? null : (
          <div className="flex justify-end gap-1">
            <ConfirmDialog
              disabled={busyId === vote.id}
              destructive={false}
              title={isEn ? "Cancel this vote?" : "Annuler ce vote ?"}
              description={
                isEn
                  ? `${vote.candidate.fullName} · ${formatCfa(vote.amountCfa, true)}. The vote stops counting.`
                  : `${vote.candidate.fullName} · ${formatCfa(vote.amountCfa, false)}. Le vote ne compte plus.`
              }
              confirmLabel={isEn ? "Cancel the vote" : "Annuler le vote"}
              cancelLabel={isEn ? "Back" : "Retour"}
              confirmDisabled={cancelReason.trim().length < 3}
              onOpenChange={(open) => {
                if (!open) setCancelReason("");
              }}
              onConfirm={() => void onCancel(vote.id)}
              trigger={
                <Button type="button" size="sm" variant="outline" aria-label={isEn ? "Cancel vote" : "Annuler le vote"}>
                  <Ban className="size-4" aria-hidden="true" />
                  <span className="hidden lg:inline">{isEn ? "Cancel" : "Annuler"}</span>
                </Button>
              }
            >
              <Input
                id={`reason-${vote.id}`}
                label={isEn ? "Reason" : "Motif"}
                placeholder={isEn ? "e.g. duplicate payment" : "ex. paiement en double"}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                helpText={isEn ? "3 characters minimum." : "3 caractères minimum."}
              />
            </ConfirmDialog>
            <ConfirmDialog
              disabled={busyId === vote.id}
              title={isEn ? "Delete this vote?" : "Supprimer ce vote ?"}
              description={isEn ? "The vote and its payment are removed. Cannot be undone." : "Le vote et son paiement sont retirés. Irréversible."}
              confirmLabel={isEn ? "Delete" : "Supprimer"}
              cancelLabel={isEn ? "Back" : "Retour"}
              onConfirm={() => void onDelete(vote.id)}
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={isEn ? "Delete vote" : "Supprimer le vote"}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="hidden lg:inline">{isEn ? "Delete" : "Supprimer"}</span>
                </Button>
              }
            />
          </div>
        )
    }
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Platform" : "Plateforme"}
        title={isEn ? "Vote moderation" : "Modération des votes"}
        description={isEn ? "Cancel or delete a vote. A copy is kept in the archive." : "Annulez ou supprimez un vote. Une copie reste dans l'archive."}
      />

      <AdminFilterCard columns="sm:grid-cols-[1fr_10rem] lg:grid-cols-[minmax(0,24rem)_10rem_auto]">
        <AdminSelect
          id="eventId"
          label={isEn ? "Event" : "Événement"}
          value={eventId}
          onChange={setEventId}
          options={[
            { value: "", label: isEn ? "All events" : "Tous les événements" },
            ...eventOptions
          ]}
        />
        <AdminSelect
          id="limit"
          label={isEn ? "Rows" : "Lignes"}
          value={String(limit)}
          onChange={(v) => setLimit(Number(v))}
          options={[25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
        />
        <label className="flex h-11 cursor-pointer items-center gap-2 text-sm sm:h-10">
          <input
            type="checkbox"
            className="size-4"
            checked={includeCancelled}
            onChange={(e) => setIncludeCancelled(e.target.checked)}
          />
          {isEn ? "Show cancelled" : "Voir les annulés"}
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
        <DataTable
          columns={voteColumns}
          rows={votes}
          rowKey={(vote) => vote.id}
          emptyLabel={isEn ? "No votes" : "Aucun vote"}
          ariaLabel={isEn ? "Platform votes" : "Votes plateforme"}
        />
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => void load(nextCursor)}>
            {isEn ? "Load more" : "Charger plus"}
          </Button>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
