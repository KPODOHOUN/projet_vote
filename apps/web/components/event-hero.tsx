// components/event-hero.tsx — Bandeau de la page des candidats d'une
// mini-plateforme, dans le style choisi par l'organisateur (Affiche, Soirée,
// Billet). Toutes les valeurs viennent de l'événement : titre, logo,
// couverture, dates, prix ; le compte à rebours part de la date stockée.

import type { ReactNode } from "react";

import { PublicEventHeader } from "./public-event-header";
import { VoteCountdown } from "./vote-countdown";
import { translate, translateVars, type Locale, type MessageKey } from "../lib/i18n";
import { formatCfa, formatEventDate } from "../lib/format";
import { MOBILE_NETWORKS } from "../lib/mobile-networks";
import { cloudinaryTransform } from "../lib/og-image-url";
import { pageStyleOf } from "../lib/minisite-style";
import type { VotePhase } from "../lib/vote-phase";
import type { PublicEvent, PublicOrganizer } from "../lib/public-event-fetch";

type EventHeroProps = {
  event: PublicEvent;
  organizer: PublicOrganizer;
  phase: VotePhase;
  locale: Locale;
  /** Instant du rendu serveur (ms), point de départ du compte à rebours. */
  now: number;
  ticketsHref?: string | undefined;
};

const gutter = "px-[clamp(20px,4vw,56px)]";

function StatusLine({ phase, locale }: { phase: VotePhase; locale: Locale }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${phase === "open" ? "bg-emerald-500" : "bg-slate-400"}`}
      />
      {translate(locale, `phase.chip.${phase}` as MessageKey)}
    </span>
  );
}

function Logo({ url, className }: { url: string | null; className: string }) {
  if (!url) return null;
  // Logo importé (Cloudinary) : recadrage carré servi à la bonne taille.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={cloudinaryTransform(url, "w_240,h_240,c_pad,b_white,f_auto,q_auto")} alt="" className={className} />;
}

function Fact({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.22em] opacity-80">{label}</dt>
      <dd className="m-0 text-[15px] font-medium">{children}</dd>
    </div>
  );
}

export function EventHero({ event, organizer, phase, locale, now, ticketsHref }: EventHeroProps) {
  const t9n = (key: MessageKey) => translate(locale, key);
  const style = pageStyleOf(event.branding.pageStyle);
  const startLabel = formatEventDate(event.startsAt, locale);
  const endLabel = formatEventDate(event.endsAt, locale);
  const dates = startLabel && endLabel ? translateVars(locale, "hub.dates", { start: startLabel, end: endLabel }) : null;
  const hasPrice = Boolean(event.voteUnitPriceCfa && event.voteUnitPriceCfa > 0);
  const price = hasPrice ? formatCfa(event.voteUnitPriceCfa!, locale) : t9n("hub.howTo.noPrice");
  const networks = MOBILE_NETWORKS.map((n) => n.label).join(" · ");
  // Compte à rebours : vers la clôture pendant le vote, vers l'ouverture avant.
  const countdownTarget = phase === "open" ? event.endsAt : phase === "upcoming" ? event.startsAt : null;
  const showCta = phase === "open" && hasPrice;
  const logoUrl = event.branding.logoUrl;

  const header = (tone: "page" | "image" | "accent") => (
    <PublicEventHeader
      eventTitle={event.title}
      slug={event.slug}
      logoUrl={logoUrl}
      active="candidates"
      ticketsHref={ticketsHref}
      tone={tone}
    />
  );

  const organizedBy = (
    <>
      {t9n("pub.organizedBy")} <span className="font-semibold">{organizer.displayName}</span>
      {dates ? <> · {dates}</> : null}
    </>
  );

  if (style === "soiree") {
    return (
      <div>
        <div className="border-b border-[var(--mini-rule)]">{header("page")}</div>
        <section className={`grid items-end gap-12 pb-16 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] ${gutter}`}>
          <div className="min-w-0">
            <Logo url={logoUrl} className="mb-8 h-20 w-20 rounded-md bg-white object-contain p-1" />
            {event.branding.tagline ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--mini-accent)]">{event.branding.tagline}</p>
            ) : null}
            <h1 className="mini-title mini-display-xl mt-4">{event.title}</h1>
            <p className="mt-6 text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
          </div>
          <div className="border border-[var(--mini-line)] p-6 sm:p-7">
            {countdownTarget ? (
              <>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mini-muted)]">
                  {t9n(phase === "open" ? "countdown.voteEndsIn" : "countdown.voteStartsIn")}
                </p>
                <VoteCountdown target={countdownTarget} now={now} variant="cells" />
              </>
            ) : (
              <p className="text-lg"><StatusLine phase={phase} locale={locale} /></p>
            )}
            {showCta ? (
              <a href="#candidates" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--color-primary)] px-7 font-bold text-[var(--color-primary-foreground)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mini-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mini-bg)]">
                {t9n("hub.cta")}
              </a>
            ) : null}
          </div>
        </section>
        <dl className={`mx-[clamp(20px,4vw,56px)] grid grid-cols-2 border-y border-[var(--mini-line)] lg:grid-cols-4`}>
          {[
            [t9n("hub.oneVote"), price],
            [t9n("hub.howTo.payment"), translateVars(locale, "hub.howTo.paymentValue", { networks: MOBILE_NETWORKS.map((n) => n.label).join(", ") })],
            [t9n("hub.howTo.counts"), t9n("hub.howTo.countsValue")],
            [t9n("hub.resultsLabel"), t9n("hub.resultsValue")]
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`py-5 pr-5 ${index % 2 === 1 ? "border-l border-[var(--mini-rule)] pl-5" : ""} ${index === 2 ? "lg:border-l lg:border-[var(--mini-rule)] lg:pl-5" : ""} ${index >= 2 ? "border-t border-[var(--mini-rule)] lg:border-t-0" : ""}`}
            >
              <dt className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--mini-muted)]">{label}</dt>
              <dd className="m-0 text-[15px]">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  if (style === "billet") {
    return (
      <div>
        <div className="border-b border-[var(--mini-rule)] bg-[var(--event-header-bg)] text-[var(--event-header-fg)]">
          {header("accent")}
          <div className={`grid items-start gap-8 pb-28 pt-10 sm:pt-14 md:grid-cols-[minmax(0,1fr)_auto] ${gutter}`}>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em]">
                {event.branding.tagline ?? organizer.displayName}
              </p>
              <h1 className="mini-title mini-display-xl mt-4">{event.title}</h1>
            </div>
            <Logo url={logoUrl} className="hidden h-28 w-28 rounded-full bg-white object-contain p-2 md:block" />
          </div>
        </div>
        <section
          aria-label={t9n("hub.howTo.title")}
          className="relative mx-[clamp(20px,4vw,56px)] -mt-20 grid overflow-visible rounded-lg bg-white text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.08),0_12px_32px_-12px_rgb(15_23_42/0.25)] md:grid-cols-[minmax(0,1fr)_18rem]"
        >
          <dl className="grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
            {dates ? <Fact label={t9n("hub.howTo.period")}>{dates}</Fact> : null}
            <Fact label={t9n("hub.howTo.payment")}>{networks}</Fact>
            <Fact label={t9n("hub.howTo.counts")}>{t9n("hub.howTo.countsValue")}</Fact>
          </dl>
          <div className="relative flex flex-col justify-between gap-4 border-t-2 border-dashed border-slate-300 p-6 sm:p-8 md:border-l-2 md:border-t-0">
            {/* Encoches du billet, à la couleur du fond de page. */}
            <span aria-hidden="true" className="absolute -left-[13px] -top-3 hidden h-6 w-6 rounded-full bg-[var(--mini-bg)] md:block" />
            <span aria-hidden="true" className="absolute -bottom-3 -left-[13px] hidden h-6 w-6 rounded-full bg-[var(--mini-bg)] md:block" />
            <div>
              <p className={`text-[13px] font-semibold ${phase === "open" ? "text-emerald-700" : "text-slate-600"}`}>
                <StatusLine phase={phase} locale={locale} />
                {countdownTarget ? (
                  <>
                    {" · "}
                    {t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}{" "}
                    <VoteCountdown target={countdownTarget} now={now} variant="inline" />
                  </>
                ) : null}
              </p>
              <p className="mt-2">
                <span className="mini-title text-[32px] leading-none tabular-nums">{hasPrice ? price : "—"}</span>{" "}
                {hasPrice ? <span className="text-sm text-slate-600">{t9n("hub.perVote")}</span> : null}
              </p>
            </div>
            {showCta ? (
              <a href="#candidates" className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-900 px-6 font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-accent-strong)] focus-visible:ring-offset-2">
                {t9n("hub.cta")}
              </a>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  // Affiche : photo de couverture derrière le titre ; sans photo, fond encre.
  const cover = event.branding.coverUrl;
  return (
    <section className="relative flex min-h-[min(88svh,820px)] flex-col bg-slate-900 text-white">
      {cover ? (
        // Couverture importée par l'organisateur ; décorative (le titre la décrit).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cloudinaryTransform(cover, "w_1920,c_fill,g_auto,f_auto,q_auto")}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgb(15_23_42/0.6)_0%,rgb(15_23_42/0.3)_35%,rgb(15_23_42/0.94)_100%)]"
      />
      <div className="relative">{header("image")}</div>
      <div className={`relative mt-auto pb-10 pt-16 ${gutter}`}>
        <Logo url={logoUrl} className="mb-6 h-16 w-16 rounded-md bg-white object-contain p-1" />
        {event.branding.tagline ? (
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
            {event.branding.tagline}
          </p>
        ) : null}
        <h1 className="mini-title mini-display-xl mb-6">{event.title}</h1>
        <p className="mb-8 text-sm text-white/80">{organizedBy}</p>
        <dl className="grid grid-cols-2 items-end gap-6 border-t border-white/35 pt-6 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <Fact label={t9n("hub.status")}><StatusLine phase={phase} locale={locale} /></Fact>
          {countdownTarget ? (
            <Fact className="col-span-2 lg:col-span-1" label={t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}>
              <span className="mini-title text-[22px] leading-none">
                <VoteCountdown target={countdownTarget} now={now} variant="inline" />
              </span>
            </Fact>
          ) : null}
          <Fact label={t9n("hub.oneVote")}>
            <span className={hasPrice ? "mini-title text-[26px] leading-none" : ""}>{price}</span>
          </Fact>
          <Fact label={t9n("hub.howTo.payment")}>{networks}</Fact>
          {showCta ? (
            <div className="col-span-2 lg:col-span-1">
              <a href="#candidates" className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--event-header-bg)] px-7 font-bold text-[var(--event-header-fg)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
                {t9n("hub.cta")}
              </a>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
