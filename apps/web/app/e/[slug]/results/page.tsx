// app/e/[slug]/results/page.tsx — Classement public en direct d'un évènement.
// Server Component. Câblé sur GET /votes/public/event/:slug/results →
// { event, results, totals }. Invariant produit : seuls les votes PAYÉS comptent
// (le backend filtre paidAt != null && cancelledAt == null).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "../../../../components/candidate-photo";
import { SITE_NAME } from "../../../../lib/site";
import { getServerLocale } from "../../../../lib/locale-server";
import { publicEventMessage } from "../../../../lib/public-event-i18n";
import { PublicEventShell } from "../../../../components/public-event-shell";

import { getApiBaseUrl } from "@/lib/api-base-url";

type ResultRow = {
  candidateId: string;
  fullName: string;
  number: number;
  photoUrl: string | null;
  voteCount: number;
};

type ResultsResponse = {
  event: {
    id: string;
    slug: string;
    title: string;
    status: string;
    branding?: { logoUrl: string | null; brandColor: string | null; tagline: string | null };
  };
  results: ResultRow[];
  // Public payload exposes vote counts only — the money collected is never
  // surfaced to voters (see VotesService.getPublicEventResults).
  totals: { votes: number };
};

async function fetchResults(slug: string): Promise<ResultsResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/votes/public/event/${encodeURIComponent(slug)}/results`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) return null;
    return (await response.json()) as ResultsResponse;
  } catch {
    return null;
  }
}

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchResults(slug);
  if (!data) {
    return { title: `Résultats introuvables · ${SITE_NAME}`, robots: { index: false, follow: false } };
  }
  const title = `Résultats en direct · ${data.event.title}`;
  const description = `Classement en direct du vote « ${data.event.title} ». ${data.totals.votes.toLocaleString("fr-FR")} votes payants comptabilisés.`;
  const url = `/e/${data.event.slug}/results`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary_large_image", title, description }
  };
}

export default async function PublicResultsPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getServerLocale();
  const isEn = locale === "en";
  const m = (key: Parameters<typeof publicEventMessage>[1]) => publicEventMessage(locale, key);
  const data = await fetchResults(slug);
  if (!data) {
    notFound();
  }

  const { event, results, totals } = data;
  const ranked = [...results].sort((a, b) => b.voteCount - a.voteCount || a.number - b.number);
  const maxVotes = ranked.reduce((max, row) => Math.max(max, row.voteCount), 0);

  const branding = event.branding ?? { logoUrl: null, brandColor: null, tagline: null };

  const podiumCandidates = [];
  if (ranked.length > 0) {
    if (ranked[1]) podiumCandidates.push({ ...ranked[1], rank: 2 });
    if (ranked[0]) podiumCandidates.push({ ...ranked[0], rank: 1 });
    if (ranked[2]) podiumCandidates.push({ ...ranked[2], rank: 3 });
  }

  const podiumConfig = {
    1: {
      heightClass: "h-36 sm:h-48",
      bgClass: "bg-gradient-to-t from-primary/30 to-primary/10 border-primary/30",
      glowClass: "podium-glow-1st",
      badgeColor: "bg-amber-400 text-amber-950 border border-amber-500/20",
      label: isEn ? "1st" : "1er",
      ringColor: "border-amber-400/50"
    },
    2: {
      heightClass: "h-28 sm:h-36",
      bgClass: "bg-gradient-to-t from-slate-400/20 to-slate-400/5 border-slate-400/20",
      glowClass: "podium-glow-2nd",
      badgeColor: "bg-slate-300 text-slate-900 border border-slate-400/20",
      label: isEn ? "2nd" : "2e",
      ringColor: "border-slate-300/40"
    },
    3: {
      heightClass: "h-20 sm:h-28",
      bgClass: "bg-gradient-to-t from-amber-700/20 to-amber-700/5 border-amber-700/20",
      glowClass: "podium-glow-3rd",
      badgeColor: "bg-amber-600 text-amber-50 border border-amber-700/20",
      label: isEn ? "3rd" : "3e",
      ringColor: "border-amber-600/40"
    }
  };

  return (
    <PublicEventShell isEn={isEn} eventTitle={event.title} slug={event.slug} branding={branding}>
      <main className="flex flex-col items-center gap-8 p-6">
        <section className="flex w-full max-w-5xl flex-col gap-6 rounded-3xl border border-border/40 bg-card/75 backdrop-blur-md p-8 shadow-2xl">
        <header className="flex flex-col gap-4 mb-2 border-b border-border/30 pb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-primary">{m("resultsTitle")}</span>
            <Link href={`/e/${event.slug}`} className="text-sm font-semibold text-foreground transition-colors hover:text-primary">
              ← {m("backToVote")}
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground m-0 leading-tight">{event.title}</h1>
        </header>

        {/* KPI Summary Cards — public view: vote counts only, never the money collected */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col p-4 rounded-2xl border border-border/30 bg-card/10 backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {isEn ? "Event Status" : "Statut de l'évènement"}
            </span>
            <span className={`text-base font-extrabold mt-1 uppercase ${event.status === "ACTIVE" ? "text-emerald-500" : "text-sky-500"}`}>
              {event.status === "ACTIVE" ? (isEn ? "Active / Open" : "Actif / Ouvert") : (isEn ? "Closed" : "Terminé")}
            </span>
          </div>
          <div className="flex flex-col p-4 rounded-2xl border border-border/30 bg-card/10 backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {isEn ? "Total Votes Cast" : "Total des votes exprimés"}
            </span>
            <span className="text-xl font-black text-foreground mt-1 tabular-nums">
              {totals.votes.toLocaleString("fr-FR")}
            </span>
          </div>
        </div>

        {ranked.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-border rounded-2xl bg-muted/20">
            <h2 className="text-xl font-bold mb-2">Aucun candidat</h2>
            <p className="text-muted-foreground">Ce vote n’a pas encore de candidat à afficher.</p>
          </div>
        ) : totals.votes === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-border rounded-2xl bg-muted/20">
            <h2 className="text-xl font-bold mb-2">Aucun vote payé pour l’instant</h2>
            <p className="text-muted-foreground mb-4">
              Le classement s’affichera dès le premier vote confirmé.
            </p>
            <Link href={`/e/${event.slug}`} className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow transition-colors hover:bg-primary/90">
              {isEn ? "Be the first to vote" : "Soyez le premier à voter"}
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 3D Podium for Top 3 */}
            {podiumCandidates.length > 0 && (
              <div className="flex flex-col items-center justify-center py-4 border-b border-border/20">
                <div className="flex items-end justify-center gap-2 sm:gap-6 w-full max-w-2xl px-2">
                  {podiumCandidates.map((cand) => {
                    const conf = podiumConfig[cand.rank as 1 | 2 | 3];
                    return (
                      <div
                        key={cand.candidateId}
                        className="flex flex-col items-center flex-1 min-w-0"
                      >
                        {/* Avatar */}
                        <div className="relative mb-3 flex flex-col items-center z-10">
                          <div className={`rounded-full p-1 border-2 ${conf.ringColor} shadow-md bg-background/80 backdrop-blur-md transition-all duration-300 hover:scale-105`}>
                            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full overflow-hidden relative border border-border/20">
                              <CandidatePhoto
                                photoUrl={cand.photoUrl}
                                fullName={cand.fullName}
                                size="sm"
                                className="object-cover w-full h-full"
                              />
                            </div>
                          </div>
                          <span className={`absolute -bottom-2 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase ${conf.badgeColor} shadow-sm select-none`}>
                            {conf.label}
                          </span>
                        </div>

                        {/* Text details */}
                        <div className="text-center w-full mb-2">
                          <p className="font-extrabold text-xs sm:text-sm text-foreground truncate max-w-full px-1">
                            {cand.fullName}
                          </p>
                          <p className="text-[10px] sm:text-xs text-primary font-black tabular-nums mt-0.5">
                            {cand.voteCount.toLocaleString("fr-FR")} votes
                          </p>
                        </div>

                        {/* 3D Pillar */}
                        <div
                          className={`podium-column w-full rounded-t-2xl border-t border-x ${conf.bgClass} ${conf.glowClass} ${conf.heightClass} flex items-center justify-center`}
                        >
                          <span className="text-lg sm:text-2xl font-black opacity-30 select-none tracking-tighter">
                            #{cand.number}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Complete ranked list */}
            <ol className="flex flex-col gap-3">
              {ranked.map((row, index) => {
                const share = maxVotes > 0 ? Math.round((row.voteCount / maxVotes) * 100) : 0;
                const isTop3 = index < 3;
                const medalColors = [
                  "bg-amber-400/10 text-amber-600 border-amber-400/25",
                  "bg-slate-400/10 text-slate-600 border-slate-400/25",
                  "bg-amber-700/10 text-amber-700 border-amber-700/25"
                ];

                return (
                  <li
                    key={row.candidateId}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-card/10 hover:bg-card/25 transition-all duration-200"
                  >
                    <span className={`w-8 h-8 flex items-center justify-center font-black text-sm rounded-full border ${
                      isTop3 
                        ? medalColors[index]
                        : "border-border/50 text-muted-foreground bg-muted/20"
                    }`}>
                      {index + 1}
                    </span>
                    <span className="flex-shrink-0 relative">
                      <CandidatePhoto photoUrl={row.photoUrl} fullName={row.fullName} size="sm" className="rounded-lg" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="font-extrabold text-foreground truncate mr-2 text-sm sm:text-base">
                          N° {row.number != null ? String(row.number).padStart(2, "0") : "--"} · {row.fullName}
                        </span>
                        <span className="font-black text-primary tabular-nums whitespace-nowrap text-sm sm:text-base">{row.voteCount.toLocaleString("fr-FR")} votes</span>
                      </div>
                      <div
                        className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden border border-border/30"
                        role="img"
                        aria-label={`${row.fullName} : ${row.voteCount} votes`}
                      >
                        <span className="block h-full bg-gradient-to-r from-primary to-cyan-500 rounded-full transition-all duration-500" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-2 font-medium">
          Seuls les votes <strong className="font-bold text-foreground">payés et confirmés</strong> sont comptabilisés dans le classement.
        </p>
        </section>
      </main>
    </PublicEventShell>
  );
}
