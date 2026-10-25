"use client";

import Link from "next/link";

import { CandidatePhoto } from "./candidate-photo";
import { publicCandidatePath } from "../lib/site";
import { useI18n } from "../lib/i18n-provider";
import { formatCount } from "../lib/format";
import type { PublicCandidate, PublicEvent } from "../app/e/[slug]/page";

// Nom conservé pour les imports existants ; plus aucune animation (7.2).
// `hover:` de Tailwind v4 ne s'applique que sous (hover: hover) : rien ne dépend
// du survol pour être lu sur mobile.
const cardLink =
  "block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-accent-strong)] focus-visible:ring-offset-2";

function NumberPill({ value }: { value: number }) {
  return (
    <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-background/95 px-2 text-sm font-extrabold text-slate-900 tabular-nums">
      {String(value).padStart(2, "0")}
    </span>
  );
}

function VotesLine({ count }: { count: number }) {
  const { t, locale } = useI18n();
  return <>{t("pub.votesCount", { count: formatCount(count, locale) })}</>;
}

function CandidateGridCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group`}>
      <div className="overflow-hidden rounded-md border border-border bg-background group-hover:ring-2 group-hover:ring-[var(--event-accent-strong)]">
        <div className="relative aspect-[3/4] bg-muted">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
          {c.number != null ? (
            <span className="absolute left-2 top-2">
              <NumberPill value={c.number} />
            </span>
          ) : null}
        </div>
        <div className="px-3 py-2.5">
          <span className="block truncate text-base font-bold leading-tight text-slate-900">{c.fullName}</span>
          <span className="mt-0.5 block text-sm text-slate-600 tabular-nums">
            <VotesLine count={c.voteCount} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function CandidateListRow({ slug, c, rank }: { slug: string; c: PublicCandidate; rank: number | null }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group`}>
      <div className="flex min-h-16 items-center gap-3 border-b border-border bg-background px-3 py-2 group-hover:bg-[var(--event-accent-light)]">
        {rank !== null ? (
          <span className="w-8 shrink-0 text-center text-sm font-extrabold text-slate-900 tabular-nums">{rank}</span>
        ) : null}
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold leading-tight text-slate-900">{c.fullName}</span>
          <span className="mt-0.5 block text-sm text-slate-600 tabular-nums">
            {c.number != null ? `N° ${String(c.number).padStart(2, "0")} · ` : null}
            <VotesLine count={c.voteCount} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function CandidateSpotlight({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group`}>
      <div className="grid overflow-hidden rounded-md border border-border bg-background group-hover:ring-2 group-hover:ring-[var(--event-accent-strong)] sm:grid-cols-2">
        <div className="relative aspect-[4/3] bg-muted sm:aspect-auto sm:min-h-[300px]">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="lg" className="h-full w-full object-cover" />
          {c.number != null ? (
            <span className="absolute left-3 top-3">
              <NumberPill value={c.number} />
            </span>
          ) : null}
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <span className="block text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">{c.fullName}</span>
          <span className="mt-2 block text-base text-slate-600 tabular-nums">
            <VotesLine count={c.voteCount} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function AnimatedCandidatesSection({
  slug,
  candidates,
  layout,
  closed = false
}: {
  slug: string;
  candidates: PublicCandidate[];
  layout: PublicEvent["layout"];
  /** Rang affiché seulement quand l'événement est clos (LIST). */
  closed?: boolean;
}) {
  if (layout === "LIST") {
    // Rang = position par voix décroissantes, calculé uniquement après clôture.
    const ranks = new Map(
      [...candidates].sort((a, b) => b.voteCount - a.voteCount).map((c, index) => [c.id, index + 1])
    );
    return (
      <div className="border-t border-border">
        {candidates.map((c) => (
          <CandidateListRow key={c.id} slug={slug} c={c} rank={closed ? (ranks.get(c.id) ?? null) : null} />
        ))}
      </div>
    );
  }

  const grid = "grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4";

  if (layout === "SPOTLIGHT" && candidates[0]) {
    // Le premier candidat dans l'ordre de l'API (numéro croissant), pas « le plus voté ».
    const [featured, ...rest] = candidates;
    return (
      <div className="space-y-8">
        <CandidateSpotlight slug={slug} c={featured} />
        {rest.length > 0 ? (
          <div className={grid}>
            {rest.map((c) => (
              <CandidateGridCard key={c.id} slug={slug} c={c} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={grid}>
      {candidates.map((c) => (
        <CandidateGridCard key={c.id} slug={slug} c={c} />
      ))}
    </div>
  );
}
