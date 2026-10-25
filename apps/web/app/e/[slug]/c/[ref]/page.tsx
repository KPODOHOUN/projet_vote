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
  const ogImage = candidate.photoUrl ?? event.branding.logoUrl;
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
      ...(ogImage ? { images: [{ url: ogImage }] } : {})
    },
    twitter: { card: "summary_large_image", title, description, ...(candidate.photoUrl ? { images: [candidate.photoUrl] } : {}) }
  };
}

export default async function CandidateProfilePage({ params }: PageProps) {
  const { slug, ref } = await params;
  const locale = await getServerLocale();
  const isEn = locale === "en";
  const data = await fetchCandidate(slug, ref);
  if (!data) {
    notFound();
  }

  const { organizer, event, candidate } = data;
  // Rendu no-store : la phase est recalculée à chaque requête (7.11-c).
  const phase = getVotePhase(event);
  const t9n = (key: MessageKey) => translate(locale, key);

  return (
    <PublicEventShell eventTitle={event.title} slug={event.slug} branding={event.branding}>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:items-start md:gap-10 md:py-10">
        <div className="relative aspect-[4/5] max-h-[42dvh] w-full overflow-hidden rounded-md bg-muted md:sticky md:top-24 md:max-h-none">
          <CandidatePhoto
            photoUrl={candidate.photoUrl}
            fullName={candidate.fullName}
            size="lg"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Scrim fonctionnel : garde la pastille lisible sur une photo claire. */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-neutral-950/50 to-transparent" aria-hidden="true" />
          {candidate.number != null ? (
            <span className="absolute bottom-3 left-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-background px-3 text-2xl font-extrabold text-slate-900 tabular-nums">
              {String(candidate.number).padStart(2, "0")}
            </span>
          ) : null}
        </div>

        <div className="mt-5 space-y-5 md:mt-0">
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">{candidate.fullName}</h1>
            {candidate.number != null ? (
              <p className="mt-1 text-base font-semibold text-slate-600">
                {translateVars(locale, "pub.candidateNumber", { number: candidate.number })}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-slate-600">
              {t9n("pub.organizedBy")} <span className="font-semibold text-slate-900">{organizer.displayName}</span>
            </p>
            <Link
              href={`/e/${event.slug}`}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t9n("profile.back")}
            </Link>
          </div>

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

          <CandidateShareBar
            eventSlug={event.slug}
            publicRef={candidate.publicRef}
            candidateName={candidate.fullName}
            isEn={isEn}
          />
        </div>
      </main>
    </PublicEventShell>
  );
}
