// app/e/[slug]/page.tsx — Mini-plateforme publique d'un évènement (event-as-platform, ADR-016).
// Server Component : fetch SSR pour le SEO + generateMetadata dynamique (OG par
// évènement). Hub annuaire : liste les candidats (photo + votes) en cartes-liens
// vers leur profil /e/{slug}/c/{number} (où se fait le vote). Câblé sur le
// contrat RÉEL de GET /votes/public/event/:slug → { organizer, event, candidates }.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../components/ui/card";
import { EmptyState, StatusChip } from "../../../components/ui/primitives";
import { SITE_NAME } from "../../../lib/site";
import { getServerLocale } from "../../../lib/locale-server";
import { formatEventStatus, publicEventDateLocale, translate, type MessageKey } from "../../../lib/i18n";
import { PublicEventShell } from "../../../components/public-event-shell";
import { AnimatedCandidatesSection } from "../../../components/animated-candidates-section";
import { Calendar, Users } from "lucide-react";

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
  const { event, organizer } = data;
  const title = `${event.title} · Votez en ligne`;
  const description =
    event.branding.tagline?.trim() ||
    `Soutenez votre candidat favori au vote « ${event.title} » organisé par ${organizer.displayName}. Vote payant sécurisé, résultats en direct.`;
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
      ...(event.branding.logoUrl ? { images: [{ url: event.branding.logoUrl }] } : {})
    },
    twitter: { card: "summary_large_image", title, description }
  };
}

// Legacy candidate card components removed in favor of shared AnimatedCandidatesSection

export default async function PublicEventPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getServerLocale();
  const isEn = locale === "en";
  const t9n = (key: MessageKey) => translate(locale, key);
  const dateLocale = publicEventDateLocale(locale);
  const data = await fetchPublicEvent(slug);
  if (!data) {
    notFound();
  }

  const { organizer, event, candidates } = data;
  const isOpen = event.status === "ACTIVE";
  const statusLabel = formatEventStatus(event.status, isEn);

  return (
    <PublicEventShell
      eventTitle={event.title}
      slug={event.slug}
      branding={event.branding}
    >
      <main className="flex flex-col items-center px-4 py-8 sm:px-6 lg:px-8">
        <Card surface="glass" className="mb-8 w-full max-w-5xl overflow-hidden p-6 sm:p-10 lg:p-12">
          <header className="mb-10 border-b border-border/50 pb-8">
            {event.branding.tagline ? (
              <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">{event.branding.tagline}</p>
            ) : null}
            <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">{event.title}</h1>
            <p className="mb-4 text-sm text-muted-foreground">
              {t9n("pub.organizedBy")} <span className="font-semibold text-foreground">{organizer.displayName}</span>
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground">
              <StatusChip tone={isOpen ? "live" : "muted"} label={statusLabel} />
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {isOpen ? `${t9n("pub.closesOn")} ` : `${t9n("pub.closedOn")} `}
                {new Date(event.endsAt).toLocaleDateString(dateLocale)}
              </div>
            </div>
          </header>

        {!isOpen ? (
          <div className="mb-10 rounded-xl border border-[var(--color-info)]/30 bg-[var(--color-info)]/10 p-6">
            <p className="text-center text-[var(--color-info-text)]">
              {t9n("pub.voteClosed")}{" "}
              <Link href={`/e/${event.slug}/results`} className="font-semibold underline underline-offset-2 hover:opacity-80">
                {t9n("pub.seeLiveResults")}
              </Link>
              .
            </p>
          </div>
        ) : null}

        {candidates.length === 0 ? (
          <EmptyState
            icon={<Users className="size-12 text-muted-foreground/50" aria-hidden="true" />}
            title={t9n("pub.noCandidates")}
            description={t9n("pub.noCandidatesDesc")}
          />
        ) : (
          <AnimatedCandidatesSection slug={event.slug} candidates={candidates} layout={event.layout ?? "GRID"} isEn={isEn} />
        )}
        </Card>
      </main>
    </PublicEventShell>
  );
}
