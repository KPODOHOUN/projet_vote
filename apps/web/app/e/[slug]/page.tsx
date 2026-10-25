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
    <PublicEventShell eventTitle={event.title} slug={event.slug} branding={event.branding} active="candidates">
      <main>
        {/* Disposition d'après la maquette « 3 · Résultats », composants de la plateforme. */}
        <section className="mx-[clamp(20px,4vw,56px)] flex flex-wrap items-end justify-between gap-8 border-b border-slate-900 pb-14 pt-16 sm:pt-20">
          <h1 className="m-0 max-w-5xl break-words font-display text-[clamp(44px,8vw,128px)] font-light uppercase leading-[0.9] tracking-[0.04em]">
            {event.title}
          </h1>
          <div className="flex max-w-sm flex-col gap-2.5">
            {event.branding.tagline ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--event-accent-strong)]">
                {event.branding.tagline}
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <StatusChip tone={PHASE_TONE[phase]} label={t9n(`phase.chip.${phase}`)} />
            </div>
            <p className="text-sm font-light leading-relaxed text-slate-600">
              {t9n("pub.organizedBy")} <span className="font-medium text-slate-900">{organizer.displayName}</span>
              {startLabel && endLabel ? (
                <>
                  <br />
                  {translateVars(locale, "hub.dates", { start: startLabel, end: endLabel })}
                </>
              ) : null}
            </p>
          </div>
        </section>

        <div className="space-y-14 px-[clamp(20px,4vw,56px)] py-14">
          <PhaseNotice phase={phase} locale={locale} startLabel={startLabel} resultsHref={resultsHref} />

          <section aria-labelledby="how-to-vote" className="max-w-2xl">
            <h2 id="how-to-vote" className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-600">
              {t9n("hub.howTo.title")}
            </h2>
            <dl className="mt-4 border-t border-slate-900 text-sm">
              <div className="grid gap-1 border-b border-slate-900/15 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <dt className="font-medium uppercase tracking-[0.06em]">{t9n("hub.howTo.price")}</dt>
                <dd className="font-light text-slate-600">
                  {event.voteUnitPriceCfa && event.voteUnitPriceCfa > 0
                    ? formatCfa(event.voteUnitPriceCfa, locale)
                    : t9n("hub.howTo.noPrice")}
                </dd>
              </div>
              {startLabel && endLabel ? (
                <div className="grid gap-1 border-b border-slate-900/15 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                  <dt className="font-medium uppercase tracking-[0.06em]">{t9n("hub.howTo.period")}</dt>
                  <dd className="font-light text-slate-600">{translateVars(locale, "hub.dates", { start: startLabel, end: endLabel })}</dd>
                </div>
              ) : null}
              <div className="grid gap-1 border-b border-slate-900/15 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <dt className="font-medium uppercase tracking-[0.06em]">{t9n("hub.howTo.payment")}</dt>
                <dd className="font-light text-slate-600">
                  {translateVars(locale, "hub.howTo.paymentValue", {
                    networks: MOBILE_NETWORKS.map((n) => n.label).join(", ")
                  })}
                </dd>
              </div>
              <div className="grid gap-1 border-b border-slate-900/15 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <dt className="font-medium uppercase tracking-[0.06em]">{t9n("hub.howTo.counts")}</dt>
                <dd className="font-light text-slate-600">{t9n("hub.howTo.countsValue")}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="candidates-title" className="border-t border-slate-900 pt-14">
            <h2 id="candidates-title" className="mb-10 font-display text-[clamp(28px,3.4vw,48px)] font-light uppercase tracking-[0.04em]">
              {t9n("minisite.candidates")}
            </h2>
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-600">{t9n("hub.noCandidates")}</p>
            ) : (
              <AnimatedCandidatesSection
                slug={event.slug}
                candidates={candidates}
                layout={event.layout ?? "GRID"}
                closed={phase === "closed"}
              />
            )}
          </section>
        </div>
      </main>
    </PublicEventShell>
  );
}
