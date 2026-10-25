import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "../../../../../components/candidate-photo";
import { CandidateShareBar } from "../../../../../components/candidate-share-bar";
import { CandidateVoteClient } from "./CandidateVoteClient";
import { publicCandidatePath, SITE_NAME } from "../../../../../lib/site";
import { getServerLocale } from "../../../../../lib/locale-server";
import { translate, translateVars, type MessageKey } from "../../../../../lib/i18n";
import { getVotePhase } from "../../../../../lib/vote-phase";
import { formatEventDate } from "../../../../../lib/format";
import { PhaseNotice } from "../../../../../components/phase-notice";
import { openGraphLocale, publicVoteDescription } from "../../../../../lib/public-meta";
import { ogImageUrl } from "../../../../../lib/og-image-url";
import { PublicEventShell } from "../../../../../components/public-event-shell";
import { ArrowLeft } from "lucide-react";

import { getApiBaseUrl } from "@/lib/api-base-url";

type CandidateProfile = {
  organizer: { displayName: string; slug: string };
  event: {
    slug: string;
    title: string;
    status: string;
    startsAt: string;
    endsAt: string;
    voteUnitPriceCfa: number | null;
    branding: { logoUrl: string | null; brandColor: string | null; tagline: string | null };
  };
  candidate: {
    id: string;
    fullName: string;
    number: number | null;
    publicRef: string;
    photoUrl: string | null;
    voteCount: number;
  };
};

async function fetchCandidate(slug: string, ref: string): Promise<CandidateProfile | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/votes/public/event/${encodeURIComponent(slug)}/candidate/${encodeURIComponent(ref)}`,
      { cache: "no-store", headers: { "Content-Type": "application/json" } }
    );
    if (!response.ok) return null;
    return (await response.json()) as CandidateProfile;
  } catch {
    return null;
  }
}

type PageProps = { params: Promise<{ slug: string; ref: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, ref } = await params;
  const locale = await getServerLocale();
  const data = await fetchCandidate(slug, ref);
  if (!data) {
    return { title: `${translate(locale, "pub.candidateNotFound")} · ${SITE_NAME}`, robots: { index: false, follow: false } };
  }
  const { candidate, event } = data;
  const title = translateVars(locale, "meta.candidate.title", { name: candidate.fullName, event: event.title });
  const description = publicVoteDescription(event, locale);
  const url = publicCandidatePath(event.slug, candidate.publicRef);
  // Photo du candidat recadrée (g_auto), sinon logo, sinon carte typographique.
  const ogImage = ogImageUrl(candidate.photoUrl) ?? ogImageUrl(event.branding.logoUrl) ?? `/e/${event.slug}/og`;
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }]
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] }
  };
}

export default async function CandidateProfilePage({ params }: PageProps) {
  const { slug, ref } = await params;
  const locale = await getServerLocale();
  const data = await fetchCandidate(slug, ref);
  if (!data) {
    notFound();
  }

  const { organizer, event, candidate } = data;
  // Rendu no-store : la phase est recalculée à chaque requête (7.11-c).
  const phase = getVotePhase(event);
  const t9n = (key: MessageKey) => translate(locale, key);

  return (
    <PublicEventShell eventTitle={event.title} slug={event.slug} branding={event.branding} active="candidates">
      {/* Disposition du bloc « vainqueur » de la maquette : photo à gauche, nom en très grand à droite. */}
      <main className="flex flex-wrap gap-[clamp(32px,5vw,80px)] px-[clamp(20px,4vw,56px)] py-10 sm:py-16">
        <div className="relative aspect-[4/5] max-h-[42dvh] min-w-0 flex-[1_1_300px] overflow-hidden rounded-md bg-slate-900/5 md:sticky md:top-6 md:max-h-[720px] md:self-start">
          <CandidatePhoto
            photoUrl={candidate.photoUrl}
            fullName={candidate.fullName}
            size="lg"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
          <div className="flex flex-col gap-4 border-b border-slate-900 pb-8">
            <Link
              href={`/e/${event.slug}`}
              className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-900 hover:opacity-65"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t9n("profile.back")}
            </Link>
            {candidate.number != null ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--event-accent-strong)]">
                {translateVars(locale, "pub.candidateNumber", { number: candidate.number })}
              </span>
            ) : null}
            <h1 className="m-0 break-words font-display text-[clamp(40px,6vw,96px)] font-light uppercase leading-[0.92] tracking-[0.04em]">
              {candidate.fullName}
            </h1>
            <p className="text-[15px] font-light text-slate-600">
              {t9n("pub.organizedBy")} <span className="font-medium text-slate-900">{organizer.displayName}</span>
            </p>
          </div>

          <div className="max-w-md">
            {phase === "open" ? (
              <CandidateVoteClient
                organizerSlug={organizer.slug}
                eventSlug={event.slug}
                candidatePublicRef={candidate.publicRef}
                candidateName={candidate.fullName}
                voteUnitPriceCfa={event.voteUnitPriceCfa}
                initialVoteCount={candidate.voteCount}
              />
            ) : (
              <PhaseNotice
                phase={phase}
                locale={locale}
                startLabel={formatEventDate(event.startsAt, locale)}
                resultsHref={`/e/${event.slug}/results`}
              />
            )}
          </div>

          <div className="max-w-md">
            <CandidateShareBar
              eventSlug={event.slug}
              publicRef={candidate.publicRef}
              candidateName={candidate.fullName}
              eventTitle={event.title}
            />
          </div>
        </div>
      </main>
    </PublicEventShell>
  );
}
