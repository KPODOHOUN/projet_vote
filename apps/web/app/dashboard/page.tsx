"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import {
  useOrganizerEvents,
  usePaymentReadiness,
} from "../../lib/hooks/use-organizer-events";
import { KpiCard, StatusChip, EmptyState, LoadingState, Button, FormError } from "@/components/ui";
import { OnboardingChecklist } from "../../components/onboarding-checklist";
import { CopyPublicLinkButton } from "../../components/copy-public-link-button";
import { formatEventStatus } from "../../lib/i18n";

export default function DashboardHomePage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) router.push(authLoginUrl());
  }, [hasToken, router]);

  const eventsQuery = useOrganizerEvents(hasToken);
  const events = eventsQuery.data ?? [];
  const latest = events[0];
  const { ready: paymentReady, skipPaymentStep } = usePaymentReadiness(latest?.id);

  useEffect(() => {
    if (!eventsQuery.isFetching && eventsQuery.isSuccess && events.length === 0) {
      router.replace("/dashboard/start");
    }
  }, [eventsQuery.isFetching, eventsQuery.isSuccess, events.length, router]);

  const activeEvents = events.filter((item) => item.status === "ACTIVE").length;
  const recentEvents = events.slice(0, 5);

  if (eventsQuery.isPending) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading dashboard metrics…" : "Chargement des indicateurs…"} />;
  }

  if (eventsQuery.isError) {
    return (
      <FormError>
        {eventsQuery.error instanceof Error
          ? eventsQuery.error.message || (isEn ? "Loading failed." : "Erreur de chargement.")
          : isEn ? "Loading failed." : "Erreur de chargement."}
      </FormError>
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
