// app/e/[slug]/results/page.tsx — Classement public d'un évènement.
// Server Component. Câblé sur GET /votes/public/event/:slug/results →
// { event, results, totals }. Invariant produit : seuls les votes PAYÉS comptent
// (le backend filtre paidAt != null && cancelledAt == null). Aucun montant n'est
// renvoyé ni affiché. Pas de polling : un lien « Actualiser » recharge la page.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "../../../../components/candidate-photo";
import { SITE_NAME } from "../../../../lib/site";
import { getServerLocale } from "../../../../lib/locale-server";
import { PublicEventShell } from "../../../../components/public-event-shell";
import { StatusChip } from "../../../../components/ui/primitives";
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

// Podium : hauteurs inégales, or seulement pour le 1er (7.5).
const PODIUM = {
  1: { height: "h-32", border: "border-[var(--color-gold-600)]" },
  2: { height: "h-24", border: "border-slate-300" },
  3: { height: "h-20", border: "border-slate-300" }
} as const;

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

  // Ordre visuel 2 · 1 · 3 ; seulement les rangs qui existent.
  const podium = [
    ranked[1] ? { row: ranked[1], rank: 2 as const } : null,
    ranked[0] ? { row: ranked[0], rank: 1 as const } : null,
    ranked[2] ? { row: ranked[2], rank: 3 as const } : null
  ].filter((entry): entry is { row: ResultRow; rank: 1 | 2 | 3 } => entry !== null);

  const votesLabel = (count: number) => translateVars(locale, "pub.votesCount", { count: formatCount(count, locale) });

  return (
    <PublicEventShell eventTitle={event.title} slug={event.slug} branding={branding}>
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
        <header className="space-y-3">
          <p className="text-sm font-semibold text-slate-600">{t9n("results.title")}</p>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-4xl">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <StatusChip tone={chip.tone} label={chip.label} />
            <span className="text-slate-600">
              {t9n("results.paidVotes")} :{" "}
              <span className="font-bold text-slate-900 tabular-nums">{formatCount(totals.votes, locale)}</span>
            </span>
            <Link href={`/e/${event.slug}/results`} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
              {t9n("results.refresh")}
            </Link>
            <Link href={`/e/${event.slug}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
              {t9n("pay.backToCandidates")}
            </Link>
          </div>
        </header>

        {ranked.length === 0 ? (
          <p className="text-sm text-slate-600">{t9n("hub.noCandidates")}</p>
        ) : totals.votes === 0 ? (
          <p className="text-sm text-slate-600">{t9n("results.noVotes")}</p>
        ) : (
          <>
            <div className="flex items-end gap-2 sm:gap-4" aria-hidden="true">
              {podium.map(({ row, rank }) => (
                <div key={row.candidateId} className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-col items-center text-center">
                    <div className="h-12 w-12 overflow-hidden rounded-md bg-muted">
                      <CandidatePhoto photoUrl={row.photoUrl} fullName={row.fullName} size="sm" className="h-full w-full object-cover" />
                    </div>
                    <p className="mt-1.5 w-full truncate text-sm font-bold text-slate-900">{row.fullName}</p>
                    <p className="text-xs text-slate-600 tabular-nums">{votesLabel(row.voteCount)}</p>
                  </div>
                  <div
                    className={`flex ${PODIUM[rank].height} items-start justify-center rounded-t-md border-2 border-b-0 ${PODIUM[rank].border} bg-background pt-2`}
                  >
                    <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{rank}</span>
                  </div>
                </div>
              ))}
            </div>

            <ol className="border-t border-border">
              {ranked.map((row, index) => {
                const share = maxVotes > 0 ? Math.round((row.voteCount / maxVotes) * 100) : 0;
                return (
                  <li key={row.candidateId} className="flex items-center gap-3 border-b border-border py-3">
                    <span className="w-7 shrink-0 text-center text-sm font-extrabold text-slate-900 tabular-nums">{index + 1}</span>
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      <CandidatePhoto photoUrl={row.photoUrl} fullName={row.fullName} size="sm" className="h-full w-full object-cover" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="truncate text-sm font-bold text-slate-900 sm:text-base">
                          {row.number != null ? `N° ${String(row.number).padStart(2, "0")} · ` : null}
                          {row.fullName}
                        </span>
                        <span className="whitespace-nowrap text-sm font-bold text-slate-900 tabular-nums">{votesLabel(row.voteCount)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-muted" aria-hidden="true">
                        <span className="block h-full bg-[var(--event-accent)]" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <p className="text-xs text-slate-600">{t9n("pub.paidOnlyNote")}</p>
      </main>
    </PublicEventShell>
  );
}
