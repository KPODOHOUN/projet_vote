"use client";

import { authLoginUrl } from "@/lib/auth-navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { canManagePaymentSecrets } from "@/lib/roles";
import { useI18n } from "@/lib/i18n-provider";
import { formatEventStatus } from "@/lib/i18n";
import { Button, ConfirmDialog, Input, StatusChip, EmptyState, LoadingState } from "@/components/ui";
import { CandidatePhoto } from "@/components/candidate-photo";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { NextStepBanner } from "@/components/next-step-banner";
import { CandidateBulkImport } from "@/components/candidate-bulk-import";
import { ActivationPaymentPanel } from "@/components/activation-payment-panel";
import { FeexPaySecretPanel } from "@/components/feexpay-secret-panel";
import { showToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { getEventPartnerStatus } from "@/lib/partners";
import { CopyCandidateLinkButton } from "@/components/copy-candidate-link-button";
import { trackEvent } from "@/lib/analytics";
import { EventDashboardShell } from "@/components/event-dashboard-shell";
import { GlassCard } from "@/components/glass-card";

type Candidate = {
  id: string;
  fullName: string;
  number: number | null;
  publicRef: string;
  photoUrl: string | null;
};

type CandidateStats = {
  candidateId: string;
  voteCount: number;
  totalAmountCfa: number;
};

type EventMeta = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

export default function EventCandidatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const { role } = useAuth();
  const isEn = locale === "en";
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;

  const [eventMeta, setEventMeta] = useState<EventMeta | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [statsByCandidate, setStatsByCandidate] = useState<Record<string, CandidateStats>>({});
  const [fullName, setFullName] = useState("");
  const [number, setNumber] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editVoteCount, setEditVoteCount] = useState("");
  const [isPartnerEvent, setIsPartnerEvent] = useState(false);

  const loadCandidates = async (token: string) => {
    const [event, list, dashboard, partnerStatus] = await Promise.all([
      apiFetch<EventMeta>(`/events/${eventId}`, { headers: { Authorization: `Bearer ${token}` } }),
      apiFetch<Candidate[]>(`/events/${eventId}/candidates`, { headers: { Authorization: `Bearer ${token}` } }),
      apiFetch<{ byCandidate: CandidateStats[] }>(`/events/${eventId}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      getEventPartnerStatus(token, eventId).catch(() => null)
    ]);
    setEventMeta(event);
    setCandidates(list);
    setStatsByCandidate(Object.fromEntries(dashboard.byCandidate.map((row) => [row.candidateId, row])));
    setIsPartnerEvent(partnerStatus?.isPartnerEvent ?? false);
    const numbered = list.filter((c) => c.number != null).map((c) => c.number as number);
    setNumber(numbered.length > 0 ? String(Math.max(...numbered) + 1) : "1");
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    void loadCandidates(token)
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : isEn ? "Loading failed." : "Chargement impossible.")
      )
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router, isEn]);

  const onCreateCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setError("");
    setIsSaving(true);
    const wasFirst = candidates.length === 0;
    try {
      await apiFetch(`/events/${eventId}/candidates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fullName,
          ...(number.trim() ? { number: Number.parseInt(number, 10) } : {}),
          ...(photoUrl.trim() ? { photoUrl: photoUrl.trim() } : {})
        })
      });
      setFullName("");
      setPhotoUrl("");
      await loadCandidates(token);
      if (wasFirst) {
        try {
          await apiFetch(`/events/${eventId}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: "ACTIVE" })
          });
          showToast.success(isEn ? "Event published!" : "Évènement publié !");
        } catch (caughtError) {
          if (caughtError instanceof ApiError && caughtError.status === 402) {
            showToast.info(
              isEn
                ? "Candidate added. Pay the launch fee to open voting."
                : "Candidat ajouté. Réglez le forfait pour ouvrir les votes."
            );
          }
        }
      } else {
        showToast.success(isEn ? "Candidate added." : "Candidat ajouté.");
      }
      void trackEvent("candidate_added", { eventId });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Creation failed." : "Création impossible.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (candidate: Candidate) => {
    setEditingId(candidate.id);
    setEditName(candidate.fullName);
    setEditNumber(candidate.number != null ? String(candidate.number) : "");
    setEditUrl(candidate.photoUrl ?? "");
    setEditVoteCount(String(statsByCandidate[candidate.id]?.voteCount ?? 0));
  };

  const onSaveCandidate = async (candidateId: string) => {
    const token = getStoredToken();
    if (!token) return;
    setError("");
    try {
      await apiFetch(`/events/${eventId}/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fullName: editName.trim(),
          ...(editNumber.trim() ? { number: Number.parseInt(editNumber, 10) } : {}),
          photoUrl: editUrl.trim() || undefined
        })
      });
      const targetVotes = Number.parseInt(editVoteCount, 10);
      if (!Number.isNaN(targetVotes)) {
        await apiFetch(`/events/${eventId}/candidates/${candidateId}/vote-count`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ voteCount: targetVotes, reason: "Ajustement organisateur" })
        });
      }
      setEditingId(null);
      await loadCandidates(token);
      showToast.success(isEn ? "Candidate updated." : "Candidat mis à jour.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Update failed." : "Mise à jour impossible.");
    }
  };

  const onDeleteCandidate = async (candidateId: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      await apiFetch(`/events/${eventId}/candidates/${candidateId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadCandidates(token);
      showToast.success(isEn ? "Candidate deleted." : "Candidat supprimé.");
    } catch (caughtError) {
      showToast.error(caughtError instanceof Error ? caughtError.message : isEn ? "Delete failed." : "Suppression impossible.");
    }
  };

  if (isLoading || !eventMeta) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading candidates…" : "Chargement des candidats…"} />;
  }

  const token = getStoredToken() ?? "";

  return (
    <EventDashboardShell
      isEn={isEn}
      eventTitle={eventMeta.title}
      eventSlug={eventMeta.slug}
      eventStatus={formatEventStatus(eventMeta.status, isEn)}
    >
      {searchParams.get("welcome") === "1" ? <NextStepBanner variant="welcome" isEn={isEn} /> : null}
      {eventMeta.status === "ACTIVE" ? <NextStepBanner variant="share" isEn={isEn} eventSlug={eventMeta.slug} /> : null}

      {eventMeta.status !== "ACTIVE" && token ? (
        <ActivationPaymentPanel eventId={eventId} token={token} isEn={isEn} onActivated={() => void loadCandidates(token)} />
      ) : null}

      {eventMeta.status === "ACTIVE" && token && canManagePaymentSecrets(role) ? (
        <FeexPaySecretPanel token={token} isEn={isEn} eventId={eventId} isPartnerEvent={isPartnerEvent} hideWhenReady />
      ) : null}

      {token ? (
        <CandidateBulkImport
          eventId={eventId}
          token={token}
          isEn={isEn}
          nextNumber={number.trim() ? Number.parseInt(number, 10) : 1}
          onImported={() => void loadCandidates(token)}
        />
      ) : null}

      <GlassCard intensity="subtle" className="p-6">
        <h2 className="mb-4 text-lg font-bold text-foreground">{isEn ? "Add candidate" : "Ajouter un candidat"}</h2>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onCreateCandidate}>
          <Input id="fullName" label={isEn ? "Full name" : "Nom complet"} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input
            id="number"
            label={isEn ? "Number" : "Numéro"}
            type="number"
            min={1}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <div className="md:col-span-2">
            <PhotoUploadField value={photoUrl} onChange={setPhotoUrl} token={token} label={isEn ? "Photo" : "Photo"} fullName={fullName} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" loading={isSaving}>
              {isEn ? "Add candidate" : "Ajouter le candidat"}
            </Button>
          </div>
        </form>
      </GlassCard>

      {candidates.length === 0 ? (
        <EmptyState
          title={isEn ? "No candidates yet" : "Aucun candidat"}
          description={isEn ? "Add your first candidate above." : "Ajoutez votre premier candidat ci-dessus."}
        />
      ) : (
        <ul className="space-y-4">
          {candidates.map((candidate) => {
            const stats = statsByCandidate[candidate.id];
            const isEditing = editingId === candidate.id;
            return (
              <li key={candidate.id}>
                <GlassCard intensity="subtle" className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <CandidatePhoto photoUrl={candidate.photoUrl} fullName={candidate.fullName} size="sm" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {candidate.number != null ? <StatusChip label={`#${candidate.number}`} tone="live" /> : null}
                          <h3 className="text-lg font-bold text-foreground">{candidate.fullName}</h3>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {stats?.voteCount ?? 0} {isEn ? "votes" : "votes"} · {(stats?.totalAmountCfa ?? 0).toLocaleString(isEn ? "en-FR" : "fr-FR")} FCFA
                        </p>
                        {eventMeta.slug ? (
                          <div className="mt-3">
                            <CopyCandidateLinkButton
                              eventSlug={eventMeta.slug}
                              publicRef={candidate.publicRef}
                              candidateName={candidate.fullName}
                              isEn={isEn}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => (isEditing ? setEditingId(null) : startEdit(candidate))}>
                        <Pencil className="mr-1.5 size-4" />
                        {isEditing ? (isEn ? "Cancel" : "Annuler") : isEn ? "Edit" : "Modifier"}
                      </Button>
                      <ConfirmDialog
                        title={isEn ? "Delete candidate?" : "Supprimer le candidat ?"}
                        description={
                          isEn
                            ? `Remove ${candidate.fullName} permanently. Candidates with paid votes cannot be deleted.`
                            : `Retirer ${candidate.fullName} définitivement. Les candidats avec votes payés ne peuvent pas être supprimés.`
                        }
                        confirmLabel={isEn ? "Delete" : "Supprimer"}
                        cancelLabel={isEn ? "Cancel" : "Annuler"}
                        onConfirm={() => void onDeleteCandidate(candidate.id)}
                        trigger={
                          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="mr-1.5 size-4" />
                            {isEn ? "Delete" : "Supprimer"}
                          </Button>
                        }
                      />
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-5 grid gap-4 border-t border-border/50 pt-5 md:grid-cols-2">
                      <Input label={isEn ? "Full name" : "Nom complet"} value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Input label={isEn ? "Number" : "Numéro"} type="number" min={1} value={editNumber} onChange={(e) => setEditNumber(e.target.value)} />
                      <Input
                        label={isEn ? "Vote count" : "Nombre de votes"}
                        type="number"
                        min={0}
                        value={editVoteCount}
                        onChange={(e) => setEditVoteCount(e.target.value)}
                        helpText={isEn ? "Manual adjustment (owner only)." : "Ajustement manuel (propriétaire)."}
                      />
                      <div className="md:col-span-2">
                        <PhotoUploadField value={editUrl} onChange={setEditUrl} token={token} label={isEn ? "Photo" : "Photo"} fullName={editName} />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <Button type="button" onClick={() => void onSaveCandidate(candidate.id)}>
                          {isEn ? "Save changes" : "Enregistrer"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 font-medium text-destructive" role="alert">
          {error}
        </div>
      ) : null}
    </EventDashboardShell>
  );
}
