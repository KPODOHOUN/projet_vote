"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Users, Vote, CalendarDays, Banknote } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { authLoginUrl } from "@/lib/auth-navigation";
import { formatEventStatus } from "@/lib/i18n";
import { LoadingState } from "@/components/ui";
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

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-FR" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

export default function EventOverviewPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const load = async (token: string) => {
    const dashboard = await apiFetch<DashboardData>(`/events/${params.eventId}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setData(dashboard);
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

  return (
    <EventDashboardShell
      isEn={isEn}
      eventTitle={data.event.title}
      eventSlug={data.event.slug}
      eventStatus={formatEventStatus(data.event.status, isEn)}
      onDeleteEvent={onDeleteEvent}
      deleting={deleting}
    >
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
    </EventDashboardShell>
  );
}
