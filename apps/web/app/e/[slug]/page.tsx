// app/e/[slug]/page.tsx — Mini-plateforme publique d'un évènement (event-as-platform, ADR-016).
// Server Component : fetch SSR pour le SEO + generateMetadata dynamique (OG par
// évènement). Hub annuaire : liste les candidats (photo + votes) en cartes-liens
// vers leur profil /e/{slug}/c/{number} (où se fait le vote). Câblé sur le
// contrat RÉEL de GET /votes/public/event/:slug → { organizer, event, candidates }.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { SITE_NAME } from "../../../lib/site";
import { getServerLocale } from "../../../lib/locale-server";
import { publicEventDateLocale, publicEventMessage } from "../../../lib/public-event-i18n";
import { formatEventStatus } from "../../../lib/i18n";
import { PublicEventShell } from "../../../components/public-event-shell";
import { AnimatedCandidatesSection } from "../../../components/animated-candidates-section";
import { Calendar, Users } from "lucide-react";

import { getApiBaseUrl } from "@/lib/api-base-url";

export type PublicCandidate = {
  id: string;
  fullName: string;
  number: number | null;
  publicRef: string;
  photoUrl: string | null;
  voteCount: number;
};

export type PublicEvent = {
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  voteUnitPriceCfa: number | null;
  layout?: "GRID" | "LIST" | "SPOTLIGHT" | null;
  branding: { logoUrl: string | null; brandColor: string | null; tagline: string | null };
};

export type PublicOrganizer = { displayName: string; slug: string };

export type PublicEventResponse = {
  organizer: PublicOrganizer;
  event: PublicEvent;
  candidates: PublicCandidate[];
};

async function fetchPublicEvent(slug: string): Promise<PublicEventResponse | null> {
  try {
    // Données live (statut/candidats peuvent évoluer) → no-store.
    const response = await fetch(`${getApiBaseUrl()}/votes/public/event/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicEventResponse;
  } catch {
    return null;
  }
}

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getServerLocale();
  const data = await fetchPublicEvent(slug);
  if (!data) {
    return {
      title: `${publicEventMessage(locale, "voteNotFound")} · ${SITE_NAME}`,
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
  const m = (key: Parameters<typeof publicEventMessage>[1]) => publicEventMessage(locale, key);
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
      isEn={isEn}
      eventTitle={event.title}
      slug={event.slug}
      branding={event.branding}
    >
      <main className="flex flex-col items-center px-4 py-8 sm:px-6 lg:px-8">
        <Card className="mb-8 w-full max-w-5xl overflow-hidden rounded-2xl border-none bg-background p-6 shadow-xl sm:p-10 lg:p-12">
          <header className="mb-10 border-b border-border/50 pb-8">
            {event.branding.tagline ? (
              <p className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">{event.branding.tagline}</p>
            ) : null}
            <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">{event.title}</h1>
            <p className="mb-4 text-sm text-muted-foreground">
              {isEn ? "Organized by" : "Organisé par"} <span className="font-semibold text-foreground">{organizer.displayName}</span>
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground">
              <Badge variant={isOpen ? "default" : "secondary"} className={isOpen ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                {statusLabel}
              </Badge>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {isOpen ? `${m("closesOn")} ` : `${m("closedOn")} `}
                {new Date(event.endsAt).toLocaleDateString(dateLocale)}
              </div>
            </div>
          </header>

        {!isOpen ? (
          <div className="p-6 rounded-xl bg-muted/50 border border-border/50 mb-10">
            <p className="text-center text-muted-foreground">
              {m("voteClosed")}{" "}
              <Link href={`/e/${event.slug}/results`} className="font-semibold text-primary hover:underline">
                {m("seeLiveResults")}
              </Link>
              .
            </p>
          </div>
        ) : null}

        {candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl bg-muted/30 border border-dashed border-border">
            <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h2 className="mb-2 text-xl font-bold">{m("noCandidates")}</h2>
            <p className="text-muted-foreground">{m("noCandidatesDesc")}</p>
          </div>
        ) : (
          <AnimatedCandidatesSection slug={event.slug} candidates={candidates} layout={event.layout ?? "GRID"} isEn={isEn} />
        )}
        </Card>
      </main>
    </PublicEventShell>
  );
}
