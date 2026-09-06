"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, ArrowRight } from "lucide-react";

import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import {
  useOrganizerEvents,
  usePaymentReadiness,
} from "../../lib/hooks/use-organizer-events";
import { useOrganizerOffer } from "../../lib/hooks/use-organizer-offer";
import { useSubscriptionUsage } from "../../lib/hooks/use-subscription";
import { KpiCard, StatusChip, EmptyState, LoadingState, Button, FormError } from "@/components/ui";
import { OnboardingChecklist } from "../../components/onboarding-checklist";
import { CopyPublicLinkButton } from "../../components/copy-public-link-button";
import { formatEventStatus } from "../../lib/i18n";

export default function DashboardHomePage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) router.push(authLoginUrl());
  }, [hasToken, router]);

  const eventsQuery = useOrganizerEvents(hasToken);
  const events = eventsQuery.data ?? [];
  const latest = events[0];
  const { ready: paymentReady, skipPaymentStep } = usePaymentReadiness(latest?.id);
  const usageQuery = useSubscriptionUsage(hasToken);
  const usage = usageQuery.data;
  const offerQuery = useOrganizerOffer(hasToken);
  const isEscrow = offerQuery.data?.offerType === "ESCROW";

  useEffect(() => {
    if (!eventsQuery.isFetching && eventsQuery.isSuccess && events.length === 0) {
      router.replace("/dashboard/start");
    }
  }, [eventsQuery.isFetching, eventsQuery.isSuccess, events.length, router]);

  const activeEvents = events.filter((item) => item.status === "ACTIVE").length;
  const recentEvents = events.slice(0, 5);

  // Escrow : jamais bloqué par l'absence d'abonnement. EXTERNAL/legacy : limite plan éventuelle.
  const subscriptionBlocked =
    offerQuery.isSuccess &&
    !isEscrow &&
    Boolean(usage) &&
    (usage!.hasSubscription === false ||
      (usage!.eventsLimit != null && usage!.eventsUsed >= usage!.eventsLimit));
  const subscriptionLimitReached =
    Boolean(usage?.hasSubscription) && usage!.eventsLimit != null && usage!.eventsUsed >= usage!.eventsLimit;
  const paymentBlocked = !subscriptionBlocked && !paymentReady && !skipPaymentStep;

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

      {subscriptionBlocked && (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--color-warning-text)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-[var(--color-warning-text)]">
                {subscriptionLimitReached ? t("dash.banner.subLimitTitle") : t("dash.banner.subMissingTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {subscriptionLimitReached ? t("dash.banner.subLimitDesc") : t("dash.banner.subMissingDesc")}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/dashboard/offer">
              {t("dash.banner.manageOffer")}
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      )}

      {paymentBlocked && (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-xl border border-[var(--color-info)]/30 bg-[var(--color-info)]/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 size-5 shrink-0 text-[var(--color-info-text)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-[var(--color-info-text)]">{t("dash.banner.paymentTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("dash.banner.paymentDesc")}</p>
            </div>
          </div>
          <Button asChild size="sm" variant="secondary" className="shrink-0">
            <Link href="/dashboard/account">
              {t("dash.banner.setupPayment")}
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      )}

      <header className="flex flex-col justify-between gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <span className="block text-sm font-bold uppercase tracking-widest text-primary">{t("dash.overview.kicker")}</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            {t("dash.overview.title")}
          </h2>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label={t("dash.overview.totalEvents")} value={String(events.length)} />
        <KpiCard label={t("dash.overview.activeEvents")} value={String(activeEvents)} />
        <KpiCard label={t("dash.overview.latestEvent")} value={events[0]?.title ?? "…"} />
      </section>

      <section>
        <h3 className="mb-4 text-xl font-bold tracking-tight text-foreground">{t("dash.overview.recentEvents")}</h3>
        {recentEvents.length === 0 ? (
          <EmptyState
            title={t("dash.overview.noEventsTitle")}
            description={t("dash.overview.noEventsDesc")}
            action={
              <Button asChild className="mt-2">
                <Link href="/dashboard/start">{t("dash.overview.launchEvent")}</Link>
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
                    {t("dash.overview.candidates")}
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
