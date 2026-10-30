// app/e/[slug]/results/page.tsx — Classement public d'un événement.
// Server Component. Câblé sur GET /votes/public/event/:slug/results →
// { event, results, totals }. Invariant produit : seuls les votes PAYÉS comptent
// (le backend filtre paidAt != null && cancelledAt == null). Aucun montant n'est
// renvoyé ni affiché. Pas de polling : un lien « Actualiser » recharge la page.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "../../../../components/candidate-photo";
import { SITE_NAME, publicEventUrl } from "../../../../lib/site";
import { getServerLocale } from "../../../../lib/locale-server";
import { ShareSheet } from "../../../../components/share-sheet";
import { PublicEventShell } from "../../../../components/public-event-shell";
import { translate, translateVars, type MessageKey } from "../../../../lib/i18n";
import { formatCount } from "../../../../lib/format";
import { getVotePhase } from "../../../../lib/vote-phase";
import { openGraphLocale } from "../../../../lib/public-meta";

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
    startsAt?: string;
    endsAt?: string;
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
  const locale = await getServerLocale();
  const data = await fetchResults(slug);
  if (!data) {
    return { title: `${translate(locale, "pub.voteNotFound")} · ${SITE_NAME}`, robots: { index: false, follow: false } };
  }
  const title = translateVars(locale, "meta.results.title", { event: data.event.title });
  const description = translate(locale, "meta.results.description");
  const url = `/e/${data.event.slug}/results`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "website", locale: openGraphLocale(locale) },
    twitter: { card: "summary_large_image", title, description }
  };
}

// Disposition d'après la maquette « 3 · Résultats » (filets, titres légers en
// capitales), avec les composants et polices de la plateforme.
const kicker = "text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--mini-muted)]";
const accentKicker = "text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--mini-accent)]";
const gutter = "px-[clamp(20px,4vw,56px)]";

export default async function PublicResultsPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getServerLocale();
  const t9n = (key: MessageKey) => translate(locale, key);
  const data = await fetchResults(slug);
  if (!data) {
    notFound();
  }

  const { event, results, totals } = data;
  const ranked = [...results].sort((a, b) => b.voteCount - a.voteCount || a.number - b.number);
  const maxVotes = ranked.reduce((max, row) => Math.max(max, row.voteCount), 0);
  const branding = event.branding ?? { logoUrl: null, brandColor: null, tagline: null };
  const phase = getVotePhase({ status: event.status, startsAt: event.startsAt, endsAt: event.endsAt });
  const chip =
    phase === "open"
      ? { tone: "live" as const, label: t9n("results.inProgress") }
      : phase === "ended" || phase === "closed"
        ? { tone: "muted" as const, label: t9n("phase.chip.closed") }
        : { tone: "draft" as const, label: t9n("phase.chip.draft") };

  // Un vainqueur n'est nommé qu'après la clôture (7.5) ; avant, classement provisoire.
  const isFinal = phase === "ended" || phase === "closed";
  const hasVotes = totals.votes > 0;
  const winner = isFinal && hasVotes ? ranked[0] : undefined;
  const podium = winner ? ranked.slice(1, 4) : [];
  const share = (count: number) => (totals.votes > 0 ? Math.round((count / totals.votes) * 100) : 0);
  const votesLabel = (count: number) => translateVars(locale, "pub.votesCount", { count: formatCount(count, locale) });
  const numberLabel = (n: number | null) =>
    n != null ? translateVars(locale, "pub.candidateNumber", { number: String(n).padStart(2, "0") }) : null;

  return (
    <PublicEventShell eventTitle={event.title} slug={event.slug} branding={branding} active="results">
      <main>
        <section className={`mx-[clamp(20px,4vw,56px)] flex flex-wrap items-end justify-between gap-8 border-b border-[var(--mini-line)] pb-14 pt-16 sm:pt-20`}>
          <h1 className="mini-title mini-display-xl m-0">
            {t9n("results.title")}
          </h1>
          <div className="flex max-w-sm flex-col gap-2.5">
            <h2 className={`m-0 ${accentKicker}`}>{event.title}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${chip.tone === "live" ? "bg-emerald-500" : "bg-slate-400"}`} />
                {chip.label}
              </span>
              {!isFinal && hasVotes ? <span className={kicker}>{t9n("results.provisional")}</span> : null}
            </div>
            <p className="text-sm font-light leading-relaxed text-[var(--mini-muted)]">
              {translateVars(locale, "results.meta", { count: formatCount(totals.votes, locale) })}
            </p>
            <Link href={`/e/${event.slug}/results`} className={`${kicker} inline-flex min-h-11 items-center hover:opacity-65`}>
              {t9n("results.refresh")}
            </Link>
            <ShareSheet
              url={publicEventUrl(event.slug) + "/results"}
              title={event.title}
              text={translateVars(locale, "share.resultsText", { event: event.title, url: publicEventUrl(event.slug) + "/results" })}
              label={t9n("share.resultsButton")}
              appearance="outline"
              className="w-fit"
            />
          </div>
        </section>

        {ranked.length === 0 || !hasVotes ? (
          <section className={`${gutter} flex flex-col items-start gap-6 py-24 sm:py-32`}>
            <p className="mini-title m-0 max-w-4xl text-[calc(clamp(28px,4vw,56px)*var(--mini-title-scale))] leading-tight">
              {ranked.length === 0 ? t9n("hub.noCandidates") : t9n("results.noVotes")}
            </p>
            {phase === "open" ? (
              <Link
                href={`/e/${event.slug}`}
                className="inline-flex min-h-11 items-center border-b border-[var(--mini-accent)] pb-1.5 text-[11px] font-medium uppercase tracking-[0.22em] hover:opacity-65"
              >
                {t9n("results.voteBeforeClose")}
              </Link>
            ) : null}
            <p className="text-xs text-[var(--mini-muted)]">{t9n("pub.paidOnlyNote")}</p>
          </section>
        ) : (
          <div className={gutter}>
            {winner ? (
              <section className="flex flex-wrap gap-[clamp(32px,5vw,80px)] py-16 sm:py-[72px]">
                <div className="relative aspect-[4/5] min-w-0 flex-[1_1_320px] overflow-hidden rounded-md bg-[var(--mini-wash)] sm:max-h-[720px]">
                  <CandidatePhoto photoUrl={winner.photoUrl} fullName={winner.fullName} size="lg" className="absolute inset-0 h-full w-full object-cover" />
                </div>
                <div className="flex min-w-0 flex-[1_1_320px] flex-col justify-end gap-5">
                  <span className={accentKicker}>{t9n("results.winner")}</span>
                  <h2 className="mini-title mini-h1 m-0">
                    {winner.fullName}
                  </h2>
                  <span className="text-[15px] font-light text-[var(--mini-muted)]">
                    {[numberLabel(winner.number), votesLabel(winner.voteCount)].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </section>
            ) : null}

            {podium.length > 0 ? (
              <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-7 gap-y-10 border-t border-[var(--mini-line)] pt-14">
                {podium.map((row, index) => (
                  <div key={row.candidateId} className="flex flex-col gap-4">
                    <div className="aspect-[4/5] overflow-hidden rounded-md bg-[var(--mini-wash)]">
                      <CandidatePhoto photoUrl={row.photoUrl} fullName={row.fullName} size="lg" className="h-full w-full object-cover" />
                    </div>
                    <span className={kicker}>{translateVars(locale, "results.place", { rank: index + 2 })}</span>
                    <span className="text-xl font-medium uppercase tracking-[0.06em]">{row.fullName}</span>
                    <span className="-mt-1.5 text-[13px] font-light text-[var(--mini-muted)]">
                      {[numberLabel(row.number), votesLabel(row.voteCount)].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="py-20 sm:py-[120px]">
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <h2 className="mini-title mini-h2 m-0">
                  {t9n("results.publicVote")}
                </h2>
                <span className={kicker}>{t9n("results.share")}</span>
              </div>
              <ol className="border-t border-[var(--mini-line)]">
                {ranked.map((row, index) => {
                  const width = maxVotes > 0 ? Math.round((row.voteCount / maxVotes) * 100) : 0;
                  return (
                    <li key={row.candidateId} className="grid grid-cols-[40px_minmax(0,1fr)_64px] items-center gap-4 border-b border-[var(--mini-rule)] py-4 sm:grid-cols-[48px_minmax(0,1fr)_80px] sm:gap-5">
                      <span className="text-[13px] text-[var(--mini-muted)] tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                      <div className="flex min-w-0 flex-col gap-2.5">
                        <span className="truncate text-sm font-medium uppercase tracking-[0.06em]">
                          {row.fullName}
                          <span className="ml-2 font-light normal-case tracking-normal text-[var(--mini-muted)]">{votesLabel(row.voteCount)}</span>
                        </span>
                        <div className="h-0.5 bg-[var(--mini-rule)]" aria-hidden="true">
                          <div
                            className="h-0.5"
                            style={{ width: `${width}%`, background: index === 0 ? "var(--mini-accent)" : "var(--mini-ink)" }}
                          />
                        </div>
                      </div>
                      <span className="text-right text-sm tabular-nums">{share(row.voteCount)} %</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-6 text-xs text-[var(--mini-muted)]">{t9n("pub.paidOnlyNote")}</p>
            </section>
          </div>
        )}
      </main>
    </PublicEventShell>
  );
}
