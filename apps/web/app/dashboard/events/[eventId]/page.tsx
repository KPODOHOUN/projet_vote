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
  offerType: "EXTERNAL" | "ESCROW";
  closedAt: string | null;
  totalCollectedCfa: number;
  votesCount: number;
  publicVotesCount: number;
  topupVotesCount: number;
  platformCommissionCfa: number;
  organizerNetCfa: number;
  walletAvailableCfa: number | null;
  walletPendingCfa: number | null;
};

type TopupQuote = {
  votesCount: number;
  unitPriceCfa: number;
  grossCfa: number;
  amountDueCfa: number;
  offerType: "EXTERNAL" | "ESCROW";
  breakdown: { description: string; platformCommissionCfa?: number };
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
            : "Évènement supprimé."
          : isEn
            ? "Event archived."
            : "Évènement archivé."
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
  const canClose = !offerStats?.closedAt && data.event.status !== "CLOSED" && data.event.status !== "ARCHIVED";

  return (
    <EventDashboardShell
      isEn={isEn}
      eventTitle={data.event.title}
      eventSlug={data.event.slug}
      eventStatus={formatEventStatus(data.event.status, isEn)}
      onDeleteEvent={onDeleteEvent}
      deleting={deleting}
    >
      {offerStats ? (
        <GlassCard intensity="subtle" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{isEn ? "Collected" : "Total encaissé"}</p>
              <p className="text-lg font-bold">{formatCfa(offerStats.totalCollectedCfa, isEn)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{isEn ? "Votes" : "Votes"}</p>
              <p className="text-lg font-bold">{offerStats.votesCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{isEn ? "Commission" : "Commission"}</p>
              <p className="text-lg font-bold">{formatCfa(offerStats.platformCommissionCfa, isEn)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{isEn ? "Net" : "Net"}</p>
              <p className="text-lg font-bold">{formatCfa(offerStats.organizerNetCfa, isEn)}</p>
            </div>
            {offerStats.offerType === "ESCROW" ? (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">{isEn ? "Wallet balance" : "Solde portefeuille"}</p>
                <p className="text-lg font-bold">
                  {formatCfa(offerStats.walletAvailableCfa ?? 0, isEn)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({isEn ? "pending" : "en attente"} {formatCfa(offerStats.walletPendingCfa ?? 0, isEn)})
                  </span>
                </p>
              </div>
            ) : null}
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
