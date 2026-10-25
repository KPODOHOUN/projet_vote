// app/e/[slug]/page.tsx — Mini-plateforme publique d'un évènement (event-as-platform, ADR-016).
// Server Component : fetch SSR pour le SEO + generateMetadata dynamique (OG par
// évènement). Hub annuaire : liste les candidats (photo + votes) en cartes-liens
// vers leur profil /e/{slug}/c/{number} (où se fait le vote). Câblé sur le
// contrat RÉEL de GET /votes/public/event/:slug → { organizer, event, candidates }.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusChip } from "../../../components/ui/primitives";
import type { ChipTone } from "../../../components/ui/primitives";
import { SITE_NAME } from "../../../lib/site";
import { getServerLocale } from "../../../lib/locale-server";
import { translate, translateVars, type MessageKey } from "../../../lib/i18n";
import { formatCfa, formatEventDate } from "../../../lib/format";
import { getVotePhase, type VotePhase } from "../../../lib/vote-phase";
import { MOBILE_NETWORKS } from "../../../lib/mobile-networks";
import { PhaseNotice } from "../../../components/phase-notice";
import { openGraphLocale, publicVoteDescription } from "../../../lib/public-meta";
import { PublicEventShell } from "../../../components/public-event-shell";
import { AnimatedCandidatesSection } from "../../../components/animated-candidates-section";

import { fetchPublicEvent } from "../../../lib/public-event-fetch";

// Types partagés de la zone publique — ré-exportés ici car des composants
// (ex. animated-candidates-section) les importent depuis cette page.
export type { PublicCandidate, PublicEvent, PublicOrganizer, PublicEventResponse } from "../../../lib/public-event-fetch";

type PageProps = { params: Promise<{ slug: string }> };

const PHASE_TONE: Record<VotePhase, ChipTone> = {
  open: "live",
  upcoming: "pending",
  ended: "muted",
  closed: "muted",
  draft: "draft"
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getServerLocale();
  const data = await fetchPublicEvent(slug);
  if (!data) {
    return {
      title: `${translate(locale, "pub.voteNotFound")} · ${SITE_NAME}`,
      robots: { index: false, follow: false }
    };
  }
  const { event } = data;
  const title = translateVars(locale, "meta.hub.title", { event: event.title });
  const description = publicVoteDescription(event, locale);
  const url = `/e/${event.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: openGraphLocale(locale),
      ...(event.branding.logoUrl ? { images: [{ url: event.branding.logoUrl }] } : {})
    },
    twitter: { card: "summary_large_image", title, description }
  };
}

export default async function PublicEventPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getServerLocale();
  const isEn = locale === "en";
  const t9n = (key: MessageKey) => translate(locale, key);
  const data = await fetchPublicEvent(slug);
  if (!data) {
    notFound();
  }

  const { organizer, event, candidates } = data;
  // Rendu no-store : la phase est recalculée à chaque requête.
  const phase = getVotePhase(event);
  const startLabel = formatEventDate(event.startsAt, locale);
  const endLabel = formatEventDate(event.endsAt, locale);
  const resultsHref = `/e/${event.slug}/results`;

  return (
    <PublicEventShell eventTitle={event.title} slug={event.slug} branding={event.branding}>
      <main>
        <section className="border-b border-border" style={{ background: "var(--event-accent-light)" }}>
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            {event.branding.tagline ? (
              <p className="text-sm font-semibold" style={{ color: "var(--event-accent-strong)" }}>
                {event.branding.tagline}
              </p>
            ) : null}
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">{event.title}</h1>
            <p className="mt-3 text-sm text-slate-600">
              {t9n("pub.organizedBy")} <span className="font-semibold text-slate-900">{organizer.displayName}</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
              <StatusChip tone={PHASE_TONE[phase]} label={t9n(`phase.chip.${phase}`)} />
              {startLabel && endLabel ? (
                <span>{translateVars(locale, "hub.dates", { start: startLabel, end: endLabel })}</span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
          <PhaseNotice phase={phase} locale={locale} startLabel={startLabel} resultsHref={resultsHref} />

          <section aria-labelledby="how-to-vote" className="max-w-xl">
            <h2 id="how-to-vote" className="text-lg font-bold text-slate-900">{t9n("hub.howTo.title")}</h2>
            <dl className="mt-4 text-sm">
              <div className="border-t border-border py-3">
                <dt className="font-semibold text-slate-900">{t9n("hub.howTo.price")}</dt>
                <dd className="mt-0.5 text-slate-600">
                  {event.voteUnitPriceCfa && event.voteUnitPriceCfa > 0
                    ? formatCfa(event.voteUnitPriceCfa, locale)
                    : t9n("hub.howTo.noPrice")}
                </dd>
              </div>
              {startLabel && endLabel ? (
                <div className="border-t border-border py-3">
                  <dt className="font-semibold text-slate-900">{t9n("hub.howTo.period")}</dt>
                  <dd className="mt-0.5 text-slate-600">{translateVars(locale, "hub.dates", { start: startLabel, end: endLabel })}</dd>
                </div>
              ) : null}
              <div className="border-t border-border py-3">
                <dt className="font-semibold text-slate-900">{t9n("hub.howTo.payment")}</dt>
                <dd className="mt-0.5 text-slate-600">
                  {translateVars(locale, "hub.howTo.paymentValue", {
                    networks: MOBILE_NETWORKS.map((n) => n.label).join(", ")
                  })}
                </dd>
              </div>
              <div className="border-t border-border py-3">
                <dt className="font-semibold text-slate-900">{t9n("hub.howTo.counts")}</dt>
                <dd className="mt-0.5 text-slate-600">{t9n("hub.howTo.countsValue")}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="candidates-title">
            <h2 id="candidates-title" className="sr-only">{t9n("hub.candidates")}</h2>
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-600">{t9n("hub.noCandidates")}</p>
            ) : (
              <AnimatedCandidatesSection
                slug={event.slug}
                candidates={candidates}
                layout={event.layout ?? "GRID"}
                isEn={isEn}
              />
            )}
          </section>
        </div>
      </main>
    </PublicEventShell>
  );
}
