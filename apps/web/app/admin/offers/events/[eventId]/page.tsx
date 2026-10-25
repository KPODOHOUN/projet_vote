"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { authedFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { Card, LoadingState, StatusChip } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminSection
} from "@/components/admin/admin-shell";
import { EventCommissionPanel } from "@/components/admin/event-commission-panel";

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
  eventHeldCfa: number | null;
  eventWithdrawableContributedCfa: number | null;
};

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

export default function AdminOfferEventDetailPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [stats, setStats] = useState<EventOfferStats | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setIsLoading(true);
    void authedFetch<EventOfferStats>(`/admin/offers/events/${params.eventId}`)
      .then(setStats)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [params.eventId, router]);

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading event…" : "Chargement…"} />;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Active events" : "Événements actifs"}
        title={stats?.title ?? (isEn ? "Event detail" : "Détail événement")}
        description={isEn ? "Ranking / Money / Activity" : "Classement / Argent / Activité"}
        actions={
          <Link href="/admin/offers/events" className="text-sm font-semibold text-primary hover:underline">
            {isEn ? "← Back to list" : "← Retour à la liste"}
          </Link>
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      {stats ? (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusChip label={stats.status} tone="muted" />
            <StatusChip
              label={stats.offerType}
              tone={stats.offerType === "ESCROW" ? "live" : "muted"}
            />
            {stats.closedAt ? (
              <StatusChip label={isEn ? "Closed" : "Clôturé"} tone="warning" />
            ) : null}
          </div>

          <AdminSection title={isEn ? "Ranking" : "Classement"}>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">
                {isEn
                  ? "Candidate ranking lives on the organizer event dashboard. Aggregate vote counts below."
                  : "Le classement candidats est sur le tableau de bord organisateur. Totaux agrégés ci-dessous."}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{isEn ? "Total votes" : "Votes totaux"}</dt>
                  <dd className="text-2xl font-extrabold">{stats.votesCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{isEn ? "Public votes" : "Votes publics"}</dt>
                  <dd className="text-2xl font-extrabold">{stats.publicVotesCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{isEn ? "Top-up votes" : "Votes ajoutés"}</dt>
                  <dd className="text-2xl font-extrabold">{stats.topupVotesCount}</dd>
                </div>
              </dl>
            </Card>
          </AdminSection>

          <AdminSection title={isEn ? "Money" : "Argent"}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">{isEn ? "Collected" : "Encaissé"}</p>
                <p className="mt-1 text-xl font-bold">{formatCfa(stats.totalCollectedCfa, isEn)}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">{isEn ? "Platform commission" : "Commission plateforme"}</p>
                <p className="mt-1 text-xl font-bold">{formatCfa(stats.platformCommissionCfa, isEn)}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">{isEn ? "Organizer net" : "Net organisateur"}</p>
                <p className="mt-1 text-xl font-bold">{formatCfa(stats.organizerNetCfa, isEn)}</p>
              </Card>
              {stats.offerType === "ESCROW" ? (
                <Card className="p-5">
                  <p className="text-sm text-muted-foreground">
                    {isEn ? "This event's contribution to wallet" : "Contribution de cet event au portefeuille"}
                  </p>
                  <p className="mt-1 text-sm">
                    {isEn ? "Sent to withdrawable (lifetime)" : "Versé au retirable (cumulé)"}:{" "}
                    {formatCfa(stats.eventWithdrawableContributedCfa ?? 0, isEn)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isEn ? "Still held for this event" : "Encore en réserve pour cet event"}:{" "}
                    {formatCfa(stats.eventHeldCfa ?? 0, isEn)}
                  </p>
                </Card>
              ) : null}
            </div>
          </AdminSection>

          {stats.offerType === "ESCROW" ? (
            <AdminSection title={isEn ? "Commission" : "Commission"}>
              <EventCommissionPanel eventId={stats.eventId} />
            </AdminSection>
          ) : null}

          <AdminSection title={isEn ? "Activity" : "Activité"}>
            <Card className="space-y-2 p-5 text-sm">
              <p>
                <span className="text-muted-foreground">{isEn ? "Event ID" : "ID événement"}:</span>{" "}
                <code className="font-mono text-xs">{stats.eventId}</code>
              </p>
              <p>
                <span className="text-muted-foreground">{isEn ? "Status" : "Statut"}:</span> {stats.status}
              </p>
              <p>
                <span className="text-muted-foreground">{isEn ? "Closed at" : "Clôturé le"}:</span>{" "}
                {stats.closedAt
                  ? new Date(stats.closedAt).toLocaleString(isEn ? "en-GB" : "fr-FR")
                  : isEn
                    ? "Not closed"
                    : "Non clôturé"}
              </p>
            </Card>
          </AdminSection>
        </>
      ) : null}
    </AdminPageShell>
  );
}
