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

// Couronne : portrait encadré, texte centré.
function FramedCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group flex flex-col items-center gap-3 text-center`}>
      <div className="w-full bg-white p-2 shadow-[0_0_0_1px_var(--mini-line)] transition-transform group-hover:-translate-y-1">
        <div className="aspect-[4/5] overflow-hidden bg-[var(--mini-wash)]">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        </div>
      </div>
      {c.number != null ? (
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--mini-accent)]">N° {pad2(c.number)}</span>
      ) : null}
      <span className="mini-title text-lg leading-tight sm:text-xl">{c.fullName}</span>
      <span className="-mt-1 text-[13px] text-[var(--mini-muted)] tabular-nums">
        <VotesLine count={c.voteCount} />
      </span>
    </Link>
  );
}

// Magazine : mosaïque, nom posé sur la photo ; la première carte est en grand.
function MosaicCard({ slug, c, feature }: { slug: string; c: PublicCandidate; feature: boolean }) {
  return (
    <Link
      href={publicCandidatePath(slug, c.publicRef)}
      className={`${cardLink} group relative block overflow-hidden rounded-md bg-[var(--mini-wash)] ${feature ? "col-span-2 lg:row-span-2" : ""}`}
    >
      <div className={`aspect-[4/5] ${feature ? "lg:aspect-auto lg:h-full" : ""}`}>
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size={feature ? "lg" : "sm"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      </div>
      {c.number != null ? (
        <span className="mini-title absolute right-3 top-2 text-[clamp(28px,3vw,44px)] text-white [text-shadow:0_1px_12px_rgb(0_0_0/0.35)] tabular-nums">
          {pad2(c.number)}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgb(15_23_42/0.86)_55%)] p-4 pt-14 text-white">
        <span className={`mini-title block leading-tight ${feature ? "text-[clamp(24px,3vw,40px)]" : "text-base sm:text-lg"}`}>{c.fullName}</span>
        <span className="mt-1 block text-[13px] text-white/80 tabular-nums">
          <VotesLine count={c.voteCount} />
        </span>
      </div>
    </Link>
  );
}

// Pop : carte à contour encre et ombre franche.
function PopCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link
      href={publicCandidatePath(slug, c.publicRef)}
      className={`${cardLink} group flex flex-col overflow-hidden rounded-md border-[3px] border-slate-900 bg-white text-slate-900 shadow-[5px_5px_0_0_#0f172a] transition-[transform,box-shadow] duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_#0f172a]`}
    >
      <div className="relative aspect-[4/5] border-b-[3px] border-slate-900 bg-[var(--mini-wash)]">
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        {c.number != null ? (
          <span className="mini-title absolute left-0 top-0 border-b-[3px] border-r-[3px] border-slate-900 bg-[var(--event-header-bg)] px-3 py-1.5 text-xl text-[var(--event-header-fg)] tabular-nums">
            {pad2(c.number)}
          </span>
        ) : null}
      </div>
      <div className="p-3.5">
        <span className="block text-base font-extrabold uppercase leading-tight sm:text-lg">{c.fullName}</span>
        <span className="mt-1 block text-[13px] font-semibold text-slate-600 tabular-nums">
          <VotesLine count={c.voteCount} />
        </span>
      </div>
    </Link>
  );
}

// Terroir : étiquette suspendue, photo en arche.
function TagCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link
      href={publicCandidatePath(slug, c.publicRef)}
      className={`${cardLink} group relative flex flex-col gap-3 rounded-md border border-[var(--mini-line)] bg-white p-3 pt-7 text-slate-900 transition-transform hover:-translate-y-1`}
    >
      <span aria-hidden="true" className="absolute left-1/2 top-2.5 h-3 w-3 -translate-x-1/2 rounded-full border border-[var(--mini-line)] bg-[var(--mini-bg)]" />
      <div className="aspect-[4/5] overflow-hidden rounded-b-sm rounded-t-[999px] bg-[var(--mini-wash)]">
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-[var(--mini-line)] pt-3">
        <span className="min-w-0 text-[15px] font-semibold leading-tight">{c.fullName}</span>
        {c.number != null ? <span className="shrink-0 text-xs font-semibold text-[var(--mini-accent)] tabular-nums">N° {pad2(c.number)}</span> : null}
      </div>
      <span className="-mt-1.5 text-[13px] text-slate-600 tabular-nums">
        <VotesLine count={c.voteCount} />
      </span>
    </Link>
  );
}

// Stade : maillot, grand numéro, bandeau du nom à la couleur de l'événement.
function JerseyCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link
      href={publicCandidatePath(slug, c.publicRef)}
      className={`${cardLink} group relative block overflow-hidden rounded-sm bg-slate-950 text-white transition-transform hover:-translate-y-1`}
    >
      <div className="relative aspect-[4/5]">
        <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover opacity-95" />
        {c.number != null ? (
          <span className="mini-title absolute left-3 top-1 text-[clamp(44px,5vw,72px)] leading-none text-[var(--event-accent-bright)] [text-shadow:0_2px_16px_rgb(0_0_0/0.45)] tabular-nums">
            {pad2(c.number)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5 bg-[var(--event-header-bg)] px-3 py-2.5 text-[var(--event-header-fg)] sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <span className="min-w-0 break-words text-sm font-extrabold uppercase leading-tight tracking-[0.04em] sm:text-base">{c.fullName}</span>
        <span className="shrink-0 text-xs font-bold tabular-nums">
          <VotesLine count={c.voteCount} />
        </span>
      </div>
    </Link>
  );
}

// Diplôme : portrait rond cerclé, nom centré.
function MedalCard({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <Link href={publicCandidatePath(slug, c.publicRef)} className={`${cardLink} group flex flex-col items-center gap-3 text-center`}>
      <div className="w-full max-w-[220px] rounded-full p-1.5 shadow-[0_0_0_2px_var(--event-accent-strong)] transition-transform group-hover:-translate-y-1">
        <div className="aspect-square overflow-hidden rounded-full bg-[var(--mini-wash)]">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="h-full w-full object-cover" />
        </div>
      </div>
      {c.number != null ? (
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--mini-accent)]">N° {pad2(c.number)}</span>
      ) : null}
      <span className="mini-title text-lg leading-tight sm:text-xl">{c.fullName}</span>
      <span className="-mt-1 text-[13px] text-[var(--mini-muted)] tabular-nums">
        <VotesLine count={c.voteCount} />
      </span>
    </Link>
  );
}

// Line-up : les candidats forment la programmation de l'affiche, en grand.
function LineupList({ slug, candidates }: { slug: string; candidates: PublicCandidate[] }) {
  return (
    <ul className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-4 text-center" role="list">
      {candidates.map((c, index) => (
        <li key={c.id} className="flex items-baseline gap-3">
          {index > 0 ? <span aria-hidden="true" className="text-[clamp(20px,3vw,36px)] text-[var(--mini-accent)]">•</span> : null}
          <Link
            href={publicCandidatePath(slug, c.publicRef)}
            className="group rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mini-accent)]"
          >
            <span className="mini-title text-[calc(clamp(28px,4.4vw,64px)*var(--mini-title-scale))] leading-[1.05] transition-colors group-hover:text-[var(--mini-accent)]">
              {c.fullName}
            </span>
            <span className="ml-2 align-super text-xs font-semibold text-[var(--mini-muted)] tabular-nums">
              <VotesLine count={c.voteCount} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
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
  if (cardStyle === "lineup" && layout !== "LIST") {
    return <LineupList slug={slug} candidates={candidates} />;
  }

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
    cardStyle === "soiree" || cardStyle === "magazine" || cardStyle === "stade"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4"
      : cardStyle === "pop"
        ? "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4"
        : "grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-7 lg:grid-cols-4";
  const card = (c: PublicCandidate, index: number) =>
    cardStyle === "soiree" ? (
      <NightCard key={c.id} slug={slug} c={c} />
    ) : cardStyle === "billet" ? (
      <TicketCard key={c.id} slug={slug} c={c} maxVotes={maxVotes} />
    ) : cardStyle === "couronne" ? (
      <FramedCard key={c.id} slug={slug} c={c} />
    ) : cardStyle === "magazine" ? (
      <MosaicCard key={c.id} slug={slug} c={c} feature={index === 0 && layout === "GRID" && candidates.length > 2} />
    ) : cardStyle === "pop" ? (
      <PopCard key={c.id} slug={slug} c={c} />
    ) : cardStyle === "terroir" ? (
      <TagCard key={c.id} slug={slug} c={c} />
    ) : cardStyle === "stade" ? (
      <JerseyCard key={c.id} slug={slug} c={c} />
    ) : cardStyle === "diplome" ? (
      <MedalCard key={c.id} slug={slug} c={c} />
    ) : (
      <PosterCard key={c.id} slug={slug} c={c} />
    );

  if (layout === "SPOTLIGHT" && candidates[0]) {
    // Le premier candidat dans l'ordre de l'API (numéro croissant), pas « le plus voté ».
    const [featured, ...rest] = candidates;
    return (
      <div className="space-y-14">
        <CandidateSpotlight slug={slug} c={featured} />
        {rest.length > 0 ? <div className={grid}>{rest.map((c, i) => card(c, i + 1))}</div> : null}
      </div>
    );
  }

  return <div className={grid}>{candidates.map(card)}</div>;
}
