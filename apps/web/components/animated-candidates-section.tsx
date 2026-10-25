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

function NumberKicker({ value }: { value: number | null }) {
  const { t } = useI18n();
  if (value == null) return null;
  return (
    <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-600">
      {t("pub.candidateNumber", { number: String(value).padStart(2, "0") })}
    </span>
  );
}

function VotesLine({ count }: { count: number }) {
  const { t, locale } = useI18n();
  return <>{t("pub.votesCount", { count: formatCount(count, locale) })}</>;
}

// Carte « podium » de la maquette : photo 4:5, numéro, nom en capitales, voix.
function CandidateGridCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group flex flex-col gap-3`}>
      <div className="aspect-[4/5] overflow-hidden rounded-md bg-slate-900/5 group-hover:ring-2 group-hover:ring-[var(--event-accent-strong)]">
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
      </div>
      <NumberKicker value={c.number} />
      <span className="text-base font-medium uppercase leading-tight tracking-[0.06em] text-slate-900 sm:text-lg">{c.fullName}</span>
      <span className="-mt-1.5 text-[13px] font-light text-slate-600 tabular-nums">
        <VotesLine count={c.voteCount} />
      </span>
    </Link>
  );
}

// Ligne de la maquette (« Vote du public ») : rang si clos, nom, voix.
function CandidateListRow({ slug, c, rank }: { slug: string; c: PublicCandidate; rank: number | null }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group`}>
      <div className="flex min-h-16 items-center gap-4 border-b border-slate-900/15 py-3 group-hover:bg-[var(--event-accent-light)]">
        <span className="w-10 shrink-0 text-[13px] text-slate-600 tabular-nums">
          {rank !== null ? String(rank).padStart(2, "0") : c.number != null ? String(c.number).padStart(2, "0") : ""}
        </span>
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-slate-900/5">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-medium uppercase tracking-[0.06em] text-slate-900">{c.fullName}</span>
        <span className="shrink-0 text-sm font-light text-slate-600 tabular-nums">
          <VotesLine count={c.voteCount} />
        </span>
      </div>
    </Link>
  );
}

// Bloc large de la maquette : photo à gauche, nom en très grand à droite.
function CandidateSpotlight({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group flex flex-wrap gap-[clamp(32px,5vw,80px)]`}>
      <div className="aspect-[4/5] min-w-0 flex-[1_1_300px] overflow-hidden rounded-md bg-slate-900/5 group-hover:ring-2 group-hover:ring-[var(--event-accent-strong)] sm:max-h-[640px]">
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="lg" className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col justify-end gap-5">
        <NumberKicker value={c.number} />
        <span className="break-words font-display text-[clamp(40px,6vw,96px)] font-light uppercase leading-[0.92] tracking-[0.04em] text-slate-900">
          {c.fullName}
        </span>
        <span className="text-[15px] font-light text-slate-600 tabular-nums">
          <VotesLine count={c.voteCount} />
        </span>
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
      <div className="border-t border-slate-900">
        {candidates.map((c) => (
          <CandidateListRow key={c.id} slug={slug} c={c} rank={closed ? (ranks.get(c.id) ?? null) : null} />
        ))}
      </div>
    );
  }

  const grid = "grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-7 lg:grid-cols-4";

  if (layout === "SPOTLIGHT" && candidates[0]) {
    // Le premier candidat dans l'ordre de l'API (numéro croissant), pas « le plus voté ».
    const [featured, ...rest] = candidates;
    return (
      <div className="space-y-14">
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
