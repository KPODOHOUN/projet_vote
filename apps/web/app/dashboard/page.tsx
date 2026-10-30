"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "../../lib/auth";
import { useI18n } from "../../lib/i18n-provider";
import { useOrganizerEvents } from "../../lib/hooks/use-organizer-events";
import { useOrganizerOffer } from "../../lib/hooks/use-organizer-offer";
import { StatusChip, EmptyState, LoadingState, Button, FormError } from "@/components/ui";
import { useWalletQuery } from "../../lib/hooks/use-wallet";
import { formatCfa, formatEventDate } from "../../lib/format";
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
  const offerQuery = useOrganizerOffer(hasToken);

  useEffect(() => {
    if (!eventsQuery.isFetching && eventsQuery.isSuccess && events.length === 0) {
      router.replace("/dashboard/start");
    }
  }, [eventsQuery.isFetching, eventsQuery.isSuccess, events.length, router]);

  const walletQuery = useWalletQuery(hasToken);
  const wallet = walletQuery.data;
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
    <div className="space-y-8">
      <OnboardingChecklist events={events} isEn={isEn} payoutConfigured={offerQuery.data?.payoutConfigured ?? false} />


      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl text-slate-900">{t("today.title")}</h1>
      </header>

      {/* Un chiffre dominant : le disponible (7.6). */}
      <section className="flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-end sm:gap-10">
        <div>
          <p className="text-sm text-slate-600">{t("today.available")}</p>
          {walletQuery.isPending ? (
            <LoadingState variant="rows" count={1} label={t("today.available")} />
          ) : walletQuery.isError || !wallet ? (
            <p className="text-sm text-slate-600">{t("today.walletUnavailable")}</p>
          ) : (
            <p className="text-4xl font-extrabold text-slate-900 tabular-nums">{formatCfa(wallet.withdrawableCfa, locale)}</p>
          )}
        </div>
        <div className="space-y-1 text-sm text-slate-600">
          {wallet ? <p>{t("today.held", { amount: formatCfa(wallet.heldCfa, locale) })}</p> : null}
          <p>{t("today.activeEvents", { count: activeEvents })}</p>
          <Link href="/dashboard/wallet" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            {t("today.walletLink")}
          </Link>
        </div>
      </section>

      {latest ? (
        <section aria-labelledby="latest-title" className="space-y-2">
          <h2 id="latest-title" className="text-sm font-semibold text-slate-600">{t("today.latest")}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <strong className="text-lg text-slate-900">{latest.title}</strong>
            <StatusChip label={formatEventStatus(latest.status, isEn)} tone={latest.status === "ACTIVE" ? "active" : "muted"} />
            <Link href={`/e/${latest.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t("today.publicLink")}
            </Link>
            <Link href={`/dashboard/events/${latest.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t("today.view")}
            </Link>
            {latest.status === "ACTIVE" ? <CopyPublicLinkButton eventSlug={latest.slug} isEn={isEn} /> : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="recent-title">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-title" className="text-lg font-bold text-slate-900">{t("today.recent")}</h2>
          <Link href="/dashboard/events" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            {t("today.allEvents")}
          </Link>
        </div>
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
          <ul className="mt-4 border-t border-border">
            {recentEvents.map((eventItem) => (
              <li key={eventItem.id} className="border-b border-border">
                <Link
                  href={`/dashboard/events/${eventItem.id}`}
                  className="flex min-h-14 items-center gap-3 py-3 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{eventItem.title}</span>
                    {eventItem.endsAt ? (
                      <span className="block text-xs text-slate-600">
                        {t("today.endsOn", { date: formatEventDate(eventItem.endsAt, locale) })}
                      </span>
                    ) : null}
                  </span>
                  <StatusChip
                    label={formatEventStatus(eventItem.status, isEn)}
                    tone={eventItem.status === "ACTIVE" ? "active" : "muted"}
                  />
                  <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
