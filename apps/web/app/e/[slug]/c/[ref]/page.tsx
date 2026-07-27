import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "../../../../../components/candidate-photo";
import { CandidateShareBar } from "../../../../../components/candidate-share-bar";
import { CandidateVoteClient } from "./CandidateVoteClient";
import { Card } from "../../../../../components/ui/card";
import { Badge } from "../../../../../components/ui/badge";
import { publicCandidatePath, SITE_NAME } from "../../../../../lib/site";
import { getServerLocale } from "../../../../../lib/locale-server";
import { formatEventStatus } from "../../../../../lib/i18n";
import { publicEventMessage } from "../../../../../lib/public-event-i18n";
import { PublicEventShell } from "../../../../../components/public-event-shell";
import { ArrowLeft } from "lucide-react";

import { getApiBaseUrl } from "@/lib/api-base-url";

type CandidateProfile = {
  organizer: { displayName: string; slug: string };
  event: {
    slug: string;
    title: string;
    status: string;
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
  const data = await fetchCandidate(slug, ref);
  if (!data) {
    return { title: `Candidat introuvable · ${SITE_NAME}`, robots: { index: false, follow: false } };
  }
  const { candidate, event } = data;
  const title = `${candidate.fullName} · ${event.title}`;
  const numberHint =
    candidate.number != null ? ` (n°${candidate.number})` : "";
  const description = `Votez pour ${candidate.fullName}${numberHint} · ${event.title}.`;
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
  const isOpen = event.status === "ACTIVE";
  const statusLabel = formatEventStatus(event.status, isEn);

  return (
    <PublicEventShell isEn={isEn} eventTitle={event.title} slug={event.slug} branding={event.branding}>
      <main className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <Card className="w-full max-w-5xl overflow-hidden rounded-3xl border border-border/40 bg-card/75 backdrop-blur-md shadow-2xl">
        <div className="flex flex-col md:flex-row">
          <div className="relative w-full md:w-5/12 lg:w-1/2 min-h-[400px] md:min-h-full bg-muted overflow-hidden">
            <CandidatePhoto 
              photoUrl={candidate.photoUrl} 
              fullName={candidate.fullName} 
              size="lg" 
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-102"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />
            {candidate.number != null ? (
              <Badge 
                className="absolute bottom-6 left-6 text-4xl sm:text-5xl font-black px-6 py-3.5 rounded-2xl bg-background/95 text-foreground backdrop-blur-md shadow-2xl border border-border/40 select-none"
              >
                {String(candidate.number).padStart(2, "0")}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-col justify-between w-full md:w-7/12 lg:w-1/2 p-6 sm:p-10 lg:p-12">
            <div>
              <nav className="flex items-center justify-between mb-8 text-sm font-semibold text-muted-foreground">
                <Link 
                  href={`/e/${event.slug}`} 
                  className="flex items-center gap-2 hover:text-primary transition-colors py-2 px-3 -ml-3 rounded-lg hover:bg-muted/50"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {event.title}
                </Link>
                <Link 
                  href={`/e/${event.slug}/results`} 
                  className="flex items-center gap-2 hover:text-primary transition-colors py-2 px-3 -mr-3 rounded-lg hover:bg-muted/50 hover:underline"
                >
                  {isEn ? "Live results" : "Résultats en direct"}
                </Link>
              </nav>

              <div className="space-y-4 mb-8">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  {isEn ? "Organized by" : "Organisé par"}{" "}
                  <span className="text-foreground">{organizer.displayName}</span>
                </p>

                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                  {candidate.fullName}
                </h1>
                
                {candidate.number != null ? (
                  <p className="text-base text-muted-foreground font-semibold">
                    {isEn ? `Candidate no. ${candidate.number}` : `Candidat n°${candidate.number}`}
                  </p>
                ) : null}
              </div>

              <div className="mb-8">
                <CandidateShareBar
                  eventSlug={event.slug}
                  publicRef={candidate.publicRef}
                  candidateName={candidate.fullName}
                  isEn={isEn}
                />
              </div>

              {isOpen ? (
                <CandidateVoteClient
                  organizerSlug={organizer.slug}
                  eventSlug={event.slug}
                  candidatePublicRef={candidate.publicRef}
                  candidateName={candidate.fullName}
                  voteUnitPriceCfa={event.voteUnitPriceCfa}
                  initialVoteCount={candidate.voteCount}
                />
              ) : (
                <div className="p-8 rounded-2xl bg-muted/30 text-center border border-border/40">
                  <h2 className="text-xl font-bold mb-3">{publicEventMessage(locale, "voteClosed")}</h2>
                  <p className="text-muted-foreground">
                    {isEn
                      ? `This event is currently ${statusLabel.toLowerCase()}.`
                      : `Cet évènement est actuellement ${statusLabel.toLowerCase()}.`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        </Card>
      </main>
    </PublicEventShell>
  );
}
