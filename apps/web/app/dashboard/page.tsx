"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import { KpiCard, StatusChip, EmptyState, LoadingState, Button } from "@/components/ui";
import { OnboardingChecklist } from "../../components/onboarding-checklist";
import { CopyPublicLinkButton } from "../../components/copy-public-link-button";
import { getPaymentSetupStatus } from "../../lib/organizer-secrets";
import { getEventPartnerStatus } from "../../lib/partners";
import { formatEventStatus } from "../../lib/i18n";

type EventItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  candidateCount: number;
};

export default function DashboardHomePage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [events, setEvents] = useState<EventItem[]>([]);
  const [paymentReady, setPaymentReady] = useState(false);
  const [skipPaymentStep, setSkipPaymentStep] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }

    void Promise.all([
      apiFetch<EventItem[]>("/events", { headers: { Authorization: `Bearer ${token}` } }),
      getPaymentSetupStatus(token).catch(() => ({ readyForVotes: false } as const))
    ])
      .then(async ([items, payment]) => {
        setEvents(items);
        setPaymentReady(payment.readyForVotes);
        const latest = items[0];
        if (latest) {
          try {
            const partner = await getEventPartnerStatus(token, latest.id);
            if (partner.isPartnerEvent) {
              setSkipPaymentStep(true);
              setPaymentReady(true);
            }
          } catch {
            /* ignore */
          }
        }
      })
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : isEn ? "Loading failed." : "Erreur de chargement.")
      )
      .finally(() => setIsLoading(false));
  }, [router, isEn]);

  useEffect(() => {
    if (!isLoading && !error && events.length === 0) {
      router.replace("/dashboard/start");
    }
  }, [isLoading, error, events.length, router]);

  const activeEvents = events.filter((item) => item.status === "ACTIVE").length;
  const recentEvents = events.slice(0, 5);

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading dashboard metrics…" : "Chargement des indicateurs…"} />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 font-medium text-destructive" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <OnboardingChecklist events={events} isEn={isEn} paymentReady={paymentReady} skipPaymentStep={skipPaymentStep} />

      <header className="flex flex-col justify-between gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <span className="block text-sm font-bold uppercase tracking-widest text-primary">{isEn ? "Overview" : "Aperçu"}</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            {isEn ? "Your events at a glance" : "Vos évènements en un coup d'œil"}
          </h2>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label={isEn ? "Total events" : "Évènements au total"} value={String(events.length)} />
        <KpiCard label={isEn ? "Active events" : "Évènements actifs"} value={String(activeEvents)} />
        <KpiCard label={isEn ? "Latest event" : "Dernier évènement"} value={events[0]?.title ?? "…"} />
      </section>

      <section>
        <h3 className="mb-4 text-xl font-bold tracking-tight text-foreground">{isEn ? "Recent events" : "Évènements récents"}</h3>
        {recentEvents.length === 0 ? (
          <EmptyState
            title={isEn ? "No events yet." : "Aucun évènement pour le moment."}
            description={isEn ? "Launch your first event in one step." : "Lancez votre premier évènement en une étape."}
            action={
              <Button asChild className="mt-2">
                <Link href="/dashboard/start">{isEn ? "Launch event" : "Lancer un évènement"}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {recentEvents.map((eventItem) => (
              <li
                key={eventItem.id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow sm:flex-row sm:items-center"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <StatusChip
                    label={formatEventStatus(eventItem.status, isEn)}
                    tone={eventItem.status === "ACTIVE" ? "active" : "muted"}
                  />
                  <strong className="text-foreground">{eventItem.title}</strong>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <CopyPublicLinkButton eventSlug={eventItem.slug} isEn={isEn} />
                  <Link
                    href={`/dashboard/events/${eventItem.id}/candidates`}
                    className="text-sm font-semibold text-primary transition-all hover:text-primary/80 hover:underline"
                  >
                    {isEn ? "Candidates" : "Candidats"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
