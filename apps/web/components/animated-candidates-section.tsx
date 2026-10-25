"use client";

import Link from "next/link";

import { CandidatePhoto } from "./candidate-photo";
import { publicCandidatePath } from "../lib/site";
import { useI18n } from "../lib/i18n-provider";
import { formatCount } from "../lib/format";
import type { PageStyleKey } from "../lib/minisite-style";
import type { PublicCandidate, PublicEvent } from "../app/e/[slug]/page";

// Nom conservé pour les imports existants ; plus aucune animation (7.2).
// `hover:` de Tailwind v4 ne s'applique que sous (hover: hover) : rien ne dépend
// du survol pour être lu sur mobile. Couleurs : jetons --mini-* (style de page).
const cardLink =
  "block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mini-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mini-bg)]";

const pad2 = (value: number) => String(value).padStart(2, "0");

function NumberKicker({ value }: { value: number | null }) {
  const { t } = useI18n();
  if (value == null) return null;
  return (
    <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--mini-muted)]">
      {t("pub.candidateNumber", { number: pad2(value) })}
    </span>
  );
}

function VotesLine({ count }: { count: number }) {
  const { t, locale } = useI18n();
  return <>{t("pub.votesCount", { count: formatCount(count, locale) })}</>;
}

const photoFrame = "aspect-[4/5] overflow-hidden rounded-md bg-[var(--mini-wash)] group-hover:ring-2 group-hover:ring-[var(--mini-accent)]";

// Affiche : photo 4:5, puis grand numéro typographique à côté du nom.
function PosterCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group flex flex-col gap-4`}>
      <div className={photoFrame}>
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
      </div>
      <div className="flex items-start gap-3">
        {c.number != null ? (
          <span className="mini-title shrink-0 whitespace-nowrap text-[26px] leading-[0.85] text-[var(--mini-accent)] tabular-nums sm:text-[34px]" aria-hidden="true">
            {pad2(c.number)}
          </span>
        ) : null}
        <div className="min-w-0">
          <span className="block text-base font-semibold uppercase leading-tight tracking-[0.06em] sm:text-lg">{c.fullName}</span>
          <span className="mt-1 block text-[13px] text-[var(--mini-muted)] tabular-nums">
            <VotesLine count={c.voteCount} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// Soirée : nom et numéro posés sur le bas de la photo, plein cadre.
function NightCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group`}>
      <div className={`relative ${photoFrame}`}>
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgb(14_18_32/0.94)_45%)] p-4 pt-12 text-[#f1f5f9]">
          {c.number != null ? (
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mini-accent)]">N° {pad2(c.number)}</span>
          ) : null}
          <span className="mt-1 block text-base font-semibold uppercase leading-tight tracking-[0.06em] sm:text-lg">{c.fullName}</span>
          <span className="mt-1 block text-[13px] text-[#a8b3c7] tabular-nums">
            <VotesLine count={c.voteCount} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// Billet : dossard numéroté sur la photo, barre de voix sous le nom.
function TicketCard({ slug, c, maxVotes }: { slug: string; c: PublicCandidate; maxVotes: number }) {
  const share = maxVotes > 0 ? Math.round((c.voteCount / maxVotes) * 100) : 0;
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group flex flex-col gap-3`}>
      <div className={`relative ${photoFrame}`}>
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        {c.number != null ? (
          <span className="mini-title absolute left-0 top-0 rounded-br-md bg-slate-900 px-3.5 py-2 text-xl text-white tabular-nums">
            {pad2(c.number)}
          </span>
        ) : null}
      </div>
      <span className="text-base font-semibold uppercase leading-tight tracking-[0.06em] sm:text-lg">{c.fullName}</span>
      <span className="-mt-1.5 text-[13px] text-[var(--mini-muted)] tabular-nums">
        <VotesLine count={c.voteCount} />
      </span>
      <span aria-hidden="true" className="block h-[3px] bg-[var(--mini-rule)]">
        <span className="block h-[3px] bg-[var(--event-accent)]" style={{ width: `${share}%` }} />
      </span>
    </Link>
  );
}

// Ligne de la maquette (« Vote du public ») : rang si clos, nom, voix.
function CandidateListRow({ slug, c, rank }: { slug: string; c: PublicCandidate; rank: number | null }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group`}>
      <div className="flex min-h-16 items-center gap-4 border-b border-[var(--mini-rule)] py-3 group-hover:bg-[var(--mini-wash)]">
        <span className="w-10 shrink-0 text-[13px] text-[var(--mini-muted)] tabular-nums">
          {rank !== null ? pad2(rank) : c.number != null ? pad2(c.number) : ""}
        </span>
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[var(--mini-wash)]">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold uppercase tracking-[0.06em]">{c.fullName}</span>
        <span className="shrink-0 text-sm text-[var(--mini-muted)] tabular-nums">
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
      <div className={`min-w-0 flex-[1_1_300px] sm:max-h-[640px] ${photoFrame}`}>
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="lg" className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col justify-end gap-5">
        <NumberKicker value={c.number} />
        <span className="mini-title mini-h1">{c.fullName}</span>
        <span className="text-[15px] text-[var(--mini-muted)] tabular-nums">
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
  closed = false,
  cardStyle = "affiche"
}: {
  slug: string;
  candidates: PublicCandidate[];
  layout: PublicEvent["layout"];
  /** Rang affiché seulement quand l'événement est clos (LIST). */
  closed?: boolean;
  /** Style de page de l'événement : forme des cartes de la grille. */
  cardStyle?: PageStyleKey;
}) {
  if (layout === "LIST") {
    // Rang = position par voix décroissantes, calculé uniquement après clôture.
    const ranks = new Map(
      [...candidates].sort((a, b) => b.voteCount - a.voteCount).map((c, index) => [c.id, index + 1])
    );
    return (
      <div>
        {candidates.map((c) => (
          <CandidateListRow key={c.id} slug={slug} c={c} rank={closed ? (ranks.get(c.id) ?? null) : null} />
        ))}
      </div>
    );
  }

  const maxVotes = Math.max(0, ...candidates.map((c) => c.voteCount));
  const grid =
    cardStyle === "soiree"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4"
      : "grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-7 lg:grid-cols-4";
  const card = (c: PublicCandidate) =>
    cardStyle === "soiree" ? (
      <NightCard key={c.id} slug={slug} c={c} />
    ) : cardStyle === "billet" ? (
      <TicketCard key={c.id} slug={slug} c={c} maxVotes={maxVotes} />
    ) : (
      <PosterCard key={c.id} slug={slug} c={c} />
    );

  if (layout === "SPOTLIGHT" && candidates[0]) {
    // Le premier candidat dans l'ordre de l'API (numéro croissant), pas « le plus voté ».
    const [featured, ...rest] = candidates;
    return (
      <div className="space-y-14">
        <CandidateSpotlight slug={slug} c={featured} />
        {rest.length > 0 ? <div className={grid}>{rest.map(card)}</div> : null}
      </div>
    );
  }

  return <div className={grid}>{candidates.map(card)}</div>;
}
