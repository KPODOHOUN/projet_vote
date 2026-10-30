"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Users, Vote, CalendarDays, Banknote } from "lucide-react";
import { apiFetch, authedFetch, ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { authLoginUrl } from "@/lib/auth-navigation";
import { formatEventStatus } from "@/lib/i18n";
import { sanitizePhoneInput } from "@/lib/phone";
import { usePayinNetworks } from "@/lib/hooks/use-payin-networks";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  LoadingState
} from "@/components/ui";
import { EventDashboardShell } from "@/components/event-dashboard-shell";
import { GlassCard } from "@/components/glass-card";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { canManageEventLifecycle } from "@/lib/roles";

type DashboardData = {
  event: {
    id: string;
    title: string;
    slug: string;
    status: string;
  };
  candidateCount: number;
  totalVotes: number;
  totalAmountCfa: number;
  todayVotes: number;
  todayAmountCfa: number;
  daily: Array<{ date: string; votes: number; amountCfa: number }>;
  byCandidate: Array<{
    candidateId: string;
    fullName: string;
    number: number | null;
    voteCount: number;
    totalAmountCfa: number;
  }>;
};

type EventOfferStats = {
  eventId: string;
  title: string;
  status: string;
  closedAt: string | null;
  votesGrossCfa: number;
  ticketsGrossCfa: number;
  totalCollectedCfa: number;
  votesCount: number;
  publicVotesCount: number;
  topupVotesCount: number;
  ticketsSoldCount: number;
  platformCommissionCfa: number;
  organizerNetCfa: number;
  eventHeldCfa: number;
  eventWithdrawableContributedCfa: number;
};

type TopupQuote = {
  votesCount: number;
  unitPriceCfa: number;
  grossCfa: number;
  amountDueCfa: number;
  breakdown: {
    description: string;
    commissionBps: number;
    platformCommissionCfa: number;
    organizerNetCfa: number;
    heldCfa: number;
    availableCfa: number;
  };
};

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-FR" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `topup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function EventOverviewPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const { locale } = useI18n();
  const { role } = useAuth();
  const isEn = locale === "en";
  const [data, setData] = useState<DashboardData | null>(null);
  const [offerStats, setOfferStats] = useState<EventOfferStats | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);

  const [topupOpen, setTopupOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [votesCount, setVotesCount] = useState("10");
  const [payerPhone, setPayerPhone] = useState("");
  // Réseau obligatoire : deviner l'opérateur d'après le numéro envoie la demande au mauvais réseau.
  const [operator, setOperator] = useState("");
  const networks = usePayinNetworks(params.eventId);
  const [quote, setQuote] = useState<TopupQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentHint, setPaymentHint] = useState("");

  const load = async (token: string) => {
    const [dashboard, stats] = await Promise.all([
      apiFetch<DashboardData>(`/events/${params.eventId}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      authedFetch<EventOfferStats>(`/organizer/events/${params.eventId}/stats`).catch(() => null)
    ]);
    setData(dashboard);
    setOfferStats(stats);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    void load(token)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.eventId, router]);

  const refreshQuote = useCallback(async () => {
    const count = Number.parseInt(votesCount, 10);
    if (!Number.isInteger(count) || count <= 0) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    setQuoteError("");
    try {
      const result = await authedFetch<TopupQuote>(
        `/organizer/events/${params.eventId}/topup-quote?votesCount=${count}`
      );
      setQuote(result);
    } catch (caught) {
      setQuote(null);
      setQuoteError(caught instanceof Error ? caught.message : isEn ? "Quote failed." : "Devis impossible.");
    } finally {
      setQuoting(false);
    }
  }, [isEn, params.eventId, votesCount]);

  useEffect(() => {
    if (!topupOpen) return;
    const handle = window.setTimeout(() => {
      void refreshQuote();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [topupOpen, refreshQuote]);

  const onDeleteEvent = async () => {
    const token = getStoredToken();
    if (!token || !data) return;
    setDeleting(true);
    try {
      const result = await apiFetch<{ deleted: boolean; archived: boolean }>(`/events/${params.eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast.success(
        result.deleted
          ? isEn
            ? "Event deleted."
            : "Événement supprimé."
          : isEn
            ? "Event archived."
            : "Événement archivé."
      );
      router.push("/dashboard/events");
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Failed." : "Échec.");
    } finally {
      setDeleting(false);
    }
  };

  const onCloseEvent = async () => {
    if (!window.confirm(isEn ? "Close this event and settle balances?" : "Terminer cet événement et solder les comptes ?")) {
      return;
    }
    setClosing(true);
    try {
      await authedFetch(`/organizer/events/${params.eventId}/close`, { method: "POST" });
      showToast.success(isEn ? "Event closed." : "Événement terminé.");
      const token = getStoredToken();
      if (token) await load(token);
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Close failed." : "Clôture impossible.");
    } finally {
      setClosing(false);
    }
  };

  const onInitTopup = async () => {
    if (!candidateId) {
      showToast.error(isEn ? "Select a candidate." : "Sélectionnez un candidat.");
      return;
    }
    const count = Number.parseInt(votesCount, 10);
    if (!Number.isInteger(count) || count <= 0) {
      showToast.error(isEn ? "Invalid vote count." : "Nombre de votes invalide.");
      return;
    }
    if (!payerPhone.trim()) {
      showToast.error(isEn ? "Payer phone required." : "Numéro payeur requis.");
      return;
    }
    if (!networks.some((network) => network.value === operator)) {
      showToast.error(isEn ? "Choose your Mobile Money network." : "Choisissez votre réseau Mobile Money.");
      return;
    }
    setPaying(true);
    setPaymentHint("");
    try {
      const result = await authedFetch<{ transactionId?: string; paymentUrl?: string; message?: string }>(
        "/payments/organizer/topup",
        {
          method: "POST",
          body: JSON.stringify({
            eventId: params.eventId,
            candidateId,
            votesCount: count,
            payerPhone: payerPhone.trim(),
            operator,
            idempotencyKey: newIdempotencyKey()
          })
        }
      );
      showToast.success(isEn ? "Payment initiated." : "Paiement initié.");
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }
      setTopupOpen(false);
      const token = getStoredToken();
      if (token) await load(token);
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 501)) {
        setPaymentHint(
          quote
            ? isEn
              ? `Amount due: ${formatCfa(quote.amountDueCfa, true)}. Payment wiring pending (endpoint missing).`
              : `Montant dû : ${formatCfa(quote.amountDueCfa, false)}. Paiement à brancher (endpoint manquant).`
            : isEn
              ? "Payment wiring pending (endpoint missing)."
              : "Paiement à brancher (endpoint manquant)."
        );
      } else {
        showToast.error(
          caught instanceof Error ? caught.message : isEn ? "Payment failed." : "Paiement impossible."
        );
      }
    } finally {
      setPaying(false);
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading dashboard…" : "Chargement du tableau de bord…"} />;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive" role="alert">
        {error || (isEn ? "Dashboard unavailable." : "Tableau de bord indisponible.")}
      </div>
    );
  }

  const kpis = [
    {
      label: isEn ? "Candidates" : "Candidats",
      value: String(data.candidateCount),
      icon: Users
    },
    {
      label: isEn ? "Total votes" : "Votes totaux",
      value: String(data.totalVotes),
      icon: Vote
    },
    {
      label: isEn ? "Votes today" : "Votes aujourd'hui",
      value: String(data.todayVotes),
      icon: CalendarDays
    },
    {
      label: isEn ? "Total revenue" : "Montant total",
      value: formatCfa(data.totalAmountCfa, isEn),
      icon: Banknote
    }
  ];

  const maxDailyVotes = Math.max(1, ...data.daily.map((row) => row.votes));
  // Terminer / supprimer : réservé au responsable (gardes API owner-only).
  const mayManageLifecycle = canManageEventLifecycle(role);
  const canClose = mayManageLifecycle && !offerStats?.closedAt && data.event.status !== "CLOSED" && data.event.status !== "ARCHIVED";

  return (
    <EventDashboardShell
      isEn={isEn}
      eventTitle={data.event.title}
      eventSlug={data.event.slug}
      eventStatus={formatEventStatus(data.event.status, isEn)}
      {...(mayManageLifecycle ? { onDeleteEvent } : {})}
      deleting={deleting}
    >
      {offerStats ? (
        <GlassCard intensity="subtle" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [isEn ? "Votes collected" : "Votes encaissés", formatCfa(offerStats.votesGrossCfa, isEn)],
                [isEn ? "Tickets collected" : "Billets encaissés", formatCfa(offerStats.ticketsGrossCfa, isEn)],
                [isEn ? "Total collected" : "Total encaissé", formatCfa(offerStats.totalCollectedCfa, isEn)],
                [isEn ? "Votes · tickets sold" : "Voix · billets vendus", `${offerStats.votesCount} · ${offerStats.ticketsSoldCount}`],
                [isEn ? "SHADOMA commission" : "Commission SHADOMA", formatCfa(offerStats.platformCommissionCfa, isEn)],
                [isEn ? "Your net share" : "Votre part nette", formatCfa(offerStats.organizerNetCfa, isEn)],
                [isEn ? "Still in reserve" : "Encore en réserve", formatCfa(offerStats.eventHeldCfa, isEn)],
                [isEn ? "Paid into available (total)" : "Versé au disponible (cumulé)", formatCfa(offerStats.eventWithdrawableContributedCfa, isEn)]
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold">{value}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              {isEn
                ? "Withdrawals draw from your total available balance, shared across your contests — see Wallet."
                : "Les retraits puisent dans votre solde disponible total, commun à tous vos concours — voir Portefeuille."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setTopupOpen(true)}>
              {isEn ? "Add votes" : "Ajouter des votes"}
            </Button>
            {canClose ? (
              <Button type="button" loading={closing} onClick={() => void onCloseEvent()}>
                {isEn ? "End event" : "Terminer l'événement"}
              </Button>
            ) : null}
          </div>
        </GlassCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <GlassCard key={kpi.label} intensity="subtle" className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
                <Icon className="size-4 text-primary" />
              </div>
              <p className="text-2xl font-extrabold tracking-tight text-foreground">{kpi.value}</p>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard intensity="subtle" className="p-6">
          <h2 className="mb-4 text-lg font-bold text-foreground">{isEn ? "Daily votes" : "Votes journaliers"}</h2>
          {data.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isEn ? "No paid votes yet." : "Aucun vote payé pour l'instant."}</p>
          ) : (
            <ul className="space-y-3">
              {data.daily.slice(-14).map((row) => (
                <li key={row.date} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{row.date}</span>
                    <span className="text-muted-foreground">
                      {row.votes} {isEn ? "votes" : "votes"} · {formatCfa(row.amountCfa, isEn)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max(8, (row.votes / maxDailyVotes) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard intensity="subtle" className="p-6">
          <h2 className="mb-4 text-lg font-bold text-foreground">{isEn ? "Ranking" : "Classement"}</h2>
          {data.byCandidate.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isEn ? "No candidates yet." : "Aucun candidat pour l'instant."}</p>
          ) : (
            <ol className="space-y-3">
              {[...data.byCandidate]
                .sort((a, b) => b.voteCount - a.voteCount)
                .map((row, index) => (
                  <li key={row.candidateId} className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{row.fullName}</p>
                        {row.number != null ? (
                          <p className="text-xs text-muted-foreground">#{row.number}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-bold text-foreground">{row.voteCount}</p>
                      <p className="text-muted-foreground">{formatCfa(row.totalAmountCfa, isEn)}</p>
                    </div>
                  </li>
                ))}
            </ol>
          )}
        </GlassCard>
      </div>

      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEn ? "Add votes" : "Ajouter des votes"}</DialogTitle>
            <DialogDescription>
              {isEn
                ? "Select a candidate, vote count, then pay the quoted amount."
                : "Choisissez un candidat, un nombre de votes, puis payez le montant du devis."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <label htmlFor="topupCandidate" className="text-sm font-medium">
                {isEn ? "Candidate" : "Candidat"}
              </label>
              <select
                id="topupCandidate"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">{isEn ? "Select…" : "Sélectionner…"}</option>
                {data.byCandidate.map((c) => (
                  <option key={c.candidateId} value={c.candidateId}>
                    {c.fullName}
                    {c.number != null ? ` (#${c.number})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="votesCount"
              label={isEn ? "Votes to add" : "Votes à ajouter"}
              type="number"
              min={1}
              value={votesCount}
              onChange={(e) => setVotesCount(e.target.value)}
            />
            <Input
              id="payerPhone"
              label={isEn ? "Payer phone" : "Téléphone payeur"}
              type="tel"
              value={payerPhone}
              onChange={(e) => setPayerPhone(sanitizePhoneInput(e.target.value))}
            />
            <div className="grid gap-1.5">
              <label htmlFor="topupOperator" className="text-sm font-medium">
                {isEn ? "Mobile Money network" : "Réseau Mobile Money"}
              </label>
              <select
                id="topupOperator"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="" disabled>{isEn ? "Choose your network" : "Choisissez votre réseau"}</option>
                {networks.map((network) => (
                  <option key={network.value} value={network.value}>
                    {network.label}
                  </option>
                ))}
              </select>
            </div>
            {quoting ? (
              <p className="text-sm text-muted-foreground">{isEn ? "Calculating…" : "Calcul…"}</p>
            ) : null}
            {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}
            {quote ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-semibold">
                  {isEn ? "Amount due" : "Montant dû"}: {formatCfa(quote.amountDueCfa, isEn)}
                </p>
                <p className="mt-1 text-muted-foreground">{quote.breakdown.description}</p>
                <p className="mt-1 text-muted-foreground">
                  {isEn ? "Commission" : "Commission"} {formatCfa(quote.breakdown.platformCommissionCfa, isEn)} ·{" "}
                  {isEn ? "reserve" : "réserve"} {formatCfa(quote.breakdown.heldCfa, isEn)} ·{" "}
                  {isEn ? "available" : "disponible"} {formatCfa(quote.breakdown.availableCfa, isEn)}
                </p>
              </div>
            ) : null}
            {paymentHint ? (
              <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning-text)]">
                {paymentHint}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setTopupOpen(false)}>
              {isEn ? "Cancel" : "Annuler"}
            </Button>
            <Button type="button" loading={paying} onClick={() => void onInitTopup()}>
              {isEn ? "Pay" : "Payer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EventDashboardShell>
  );
}
