// app/e/[slug]/page.tsx — Mini-plateforme publique d'un événement (event-as-platform, ADR-016).
// Server Component : fetch SSR pour le SEO + generateMetadata dynamique (OG par
// événement). Hub annuaire : liste les candidats (photo + votes) en cartes-liens
// vers leur profil /e/{slug}/c/{number} (où se fait le vote). Câblé sur le
// contrat RÉEL de GET /votes/public/event/:slug → { organizer, event, candidates }.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_NAME } from "../../../lib/site";
import { getServerLocale } from "../../../lib/locale-server";
import { translate, translateVars, type MessageKey } from "../../../lib/i18n";
import { formatEventDate } from "../../../lib/format";
import { getVotePhase } from "../../../lib/vote-phase";
import { pageStyleOf } from "../../../lib/minisite-style";
import { EventHero } from "../../../components/event-hero";
import { PhaseNotice } from "../../../components/phase-notice";
import { openGraphLocale, publicVoteDescription } from "../../../lib/public-meta";
import { ogImageUrl } from "../../../lib/og-image-url";
import { PublicEventShell } from "../../../components/public-event-shell";
import { AnimatedCandidatesSection } from "../../../components/animated-candidates-section";

import { fetchPublicEvent } from "../../../lib/public-event-fetch";

// Types partagés de la zone publique — ré-exportés ici car des composants
// (ex. animated-candidates-section) les importent depuis cette page.
export type { PublicCandidate, PublicEvent, PublicOrganizer, PublicEventResponse } from "../../../lib/public-event-fetch";

type PageProps = { params: Promise<{ slug: string }> };

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
  // Logo recadré si présent, sinon carte typographique générée (/e/{slug}/og).
  const ogImage = ogImageUrl(event.branding.logoUrl) ?? `${url}/og`;
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: event.title }]
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] }
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
  // Rendu no-store : la phase et le compte à rebours partent de l'instant de la requête.
  const now = Date.now();
  const phase = getVotePhase(event);
  const startLabel = formatEventDate(event.startsAt, locale);
  const resultsHref = `/e/${event.slug}/results`;

  return (
    <PublicEventShell eventTitle={event.title} slug={event.slug} branding={event.branding} active="candidates" headerInHero>
      <main>
        {/* Bandeau dans le style choisi par l'organisateur (Affiche, Soirée, Billet). */}
        <EventHero event={event} organizer={organizer} phase={phase} locale={locale} now={now} paymentNetworks={data.paymentNetworks} />

        <div className="space-y-14 px-[clamp(20px,4vw,56px)] pb-24 pt-14">
          <PhaseNotice phase={phase} locale={locale} startLabel={startLabel} resultsHref={resultsHref} />

          <section id="candidates" aria-labelledby="candidates-title" className="scroll-mt-6">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--mini-line)] pb-6">
              <h2 id="candidates-title" className="mini-title mini-h2">
                {t9n("minisite.candidates")}
              </h2>
              {candidates.length > 0 ? (
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mini-muted)]">
                  {translateVars(locale, "hub.inRunning", { count: String(candidates.length) })}
                </span>
              ) : null}
            </div>
            {candidates.length === 0 ? (
              <p className="text-sm text-[var(--mini-muted)]">{t9n("hub.noCandidates")}</p>
            ) : (
              <AnimatedCandidatesSection
                slug={event.slug}
                candidates={candidates}
                layout={event.layout ?? "GRID"}
                closed={phase === "closed"}
                cardStyle={pageStyleOf(event.branding.pageStyle)}
              />
            )}
          </section>
        </div>
      </main>
    </PublicEventShell>
  );
}
