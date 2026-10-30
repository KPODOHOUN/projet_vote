// components/event-hero.tsx — Bandeau de la page des candidats d'une
// mini-plateforme, dans le style choisi par l'organisateur (dix-sept styles,
// de Affiche à Sanctuaire). Toutes les valeurs viennent de l'événement : titre, logo,
// couverture, dates, prix ; le compte à rebours part de la date stockée.

import type { ReactNode } from "react";

import { PublicEventHeader } from "./public-event-header";
import { VoteCountdown } from "./vote-countdown";
import { ShareSheet } from "./share-sheet";
import { publicEventUrl } from "../lib/site";
import { translate, translateVars, type Locale, type MessageKey } from "../lib/i18n";
import { formatCfa, formatEventDate } from "../lib/format";
import { MOBILE_NETWORKS } from "../lib/mobile-networks";
import { cloudinaryTransform } from "../lib/og-image-url";
import { heroImageOf, pageStyleOf } from "../lib/minisite-style";
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
  /** Réseaux que le prestataire du concours sait débiter (absent d'une ancienne API : tous). */
  paymentNetworks?: string[] | undefined;
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

export function EventHero({ event, organizer, phase, locale, now, ticketsHref, paymentNetworks }: EventHeroProps) {
  const t9n = (key: MessageKey) => translate(locale, key);
  const style = pageStyleOf(event.branding.pageStyle);
  const startLabel = formatEventDate(event.startsAt, locale);
  const endLabel = formatEventDate(event.endsAt, locale);
  const dates = startLabel && endLabel ? translateVars(locale, "hub.dates", { start: startLabel, end: endLabel }) : null;
  const hasPrice = Boolean(event.voteUnitPriceCfa && event.voteUnitPriceCfa > 0);
  const price = hasPrice ? formatCfa(event.voteUnitPriceCfa!, locale) : t9n("hub.howTo.noPrice");
  const networks = MOBILE_NETWORKS.filter((n) => !paymentNetworks || paymentNetworks.includes(n.value))
    .map((n) => n.label)
    .join(" · ");
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

  // Couverture importée, sauf si l'organisateur a choisi « couleur unie » pour le fond.
  const cover = heroImageOf(event.branding);
  const coverSrc = cover ? cloudinaryTransform(cover, "w_1920,c_fill,g_auto,f_auto,q_auto") : null;
  /** Couverture posée derrière un bandeau, sous un voile qui garde le texte lisible. */
  const bandImage = (veil: string) =>
    coverSrc ? (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverSrc} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className={`absolute inset-0 ${veil}`} />
      </>
    ) : null;
  const shareUrl = publicEventUrl(event.slug);
  const share = (appearance: "solid" | "outline", className = "") => (
    <ShareSheet
      url={shareUrl}
      title={event.title}
      text={translateVars(locale, "share.eventText", { event: event.title, url: shareUrl })}
      label={t9n("share.eventButton")}
      appearance={appearance}
      className={className}
    />
  );
  const cta = (className: string) =>
    showCta ? (
      <a href="#candidates" className={`inline-flex min-h-12 items-center justify-center px-7 font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}>
        {t9n("hub.cta")}
      </a>
    ) : null;
  const countdownLabel = t9n(phase === "open" ? "countdown.voteEndsIn" : "countdown.voteStartsIn");

  const organizedBy = (
    <>
      {t9n("pub.organizedBy")} <span className="font-semibold">{organizer.displayName}</span>
      {dates ? <> · {dates}</> : null}
    </>
  );

  if (style === "couronne") {
    // Couronne : composition centrée de gala ; la couverture passe sous un voile clair.
    return (
      <section className="relative overflow-hidden border-b border-[var(--mini-line)]">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div aria-hidden="true" className="absolute inset-0 bg-[var(--mini-bg)] opacity-[0.88]" />
        <div className="relative">{header("page")}</div>
        <div className={`relative mx-auto flex max-w-4xl flex-col items-center pb-16 pt-8 text-center sm:pb-20 sm:pt-12 ${gutter}`}>
          {logoUrl ? (
            <span className="mb-7 rounded-full bg-white p-2 shadow-[0_0_0_1px_var(--mini-line),0_0_0_7px_var(--mini-bg),0_0_0_8px_var(--mini-line)]">
              <Logo url={logoUrl} className="h-24 w-24 rounded-full object-contain sm:h-28 sm:w-28" />
            </span>
          ) : null}
          {event.branding.tagline ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--mini-accent)]">{event.branding.tagline}</p>
          ) : null}
          <h1 className="mini-title mini-display mt-4 text-balance">{event.title}</h1>
          <div aria-hidden="true" className="my-7 flex w-full max-w-xs items-center gap-3 text-[var(--mini-accent)]">
            <span className="h-px flex-1 bg-current opacity-60" />
            <span className="h-2 w-2 rotate-45 bg-current" />
            <span className="h-px flex-1 bg-current opacity-60" />
          </div>
          <p className="text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
          {countdownTarget ? (
            <div className="mt-9 w-full max-w-md">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mini-muted)]">{countdownLabel}</p>
              <VoteCountdown target={countdownTarget} now={now} variant="cells" />
            </div>
          ) : (
            <p className="mt-8 text-base font-medium"><StatusLine phase={phase} locale={locale} /></p>
          )}
          <p className="mt-6 text-sm text-[var(--mini-muted)]">
            {t9n("hub.oneVote")} · <span className="font-semibold text-[var(--mini-ink)]">{price}</span> · {networks}
          </p>
          <div className="mt-7 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
            {cta("rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)]")}
            {share("outline", "rounded-full")}
          </div>
        </div>
      </section>
    );
  }

  if (style === "magazine") {
    // Magazine : une de magazine, couverture sur une moitié, titre éditorial sur l'autre.
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <section className="grid border-b border-[var(--mini-line)] lg:min-h-[min(86svh,860px)] lg:grid-cols-2">
          <div className="relative min-h-[48svh] overflow-hidden bg-[var(--event-accent)] lg:min-h-0">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverSrc} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
            ) : logoUrl ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-white p-3"><Logo url={logoUrl} className="h-36 w-36 rounded-full object-contain sm:h-44 sm:w-44" /></span>
              </span>
            ) : null}
            {coverSrc && logoUrl ? <Logo url={logoUrl} className="absolute left-5 top-5 h-16 w-16 rounded-md bg-white object-contain p-1" /> : null}
            <span className="absolute bottom-5 left-5 inline-flex items-center rounded-sm bg-white px-3 py-1.5 text-xs font-semibold text-slate-900">
              <StatusLine phase={phase} locale={locale} />
            </span>
          </div>
          <div className={`flex min-w-0 flex-col justify-between gap-10 py-10 sm:py-14 ${gutter}`}>
            <div className="min-w-0">
              {dates ? <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--mini-muted)]">{dates}</p> : null}
              {/* Demi-colonne : taille calée sur la largeur de la colonne, coupure aux tirets et espaces. */}
              <h1 className="mini-title mt-6 text-[calc(clamp(40px,5vw,88px)*var(--mini-title-scale))] mini-title-nobreak leading-[0.95]">
                {event.title}
              </h1>
              {event.branding.tagline ? (
                <p className="mt-6 max-w-md text-xl font-light leading-snug sm:text-2xl">{event.branding.tagline}</p>
              ) : null}
              <p className="mt-4 text-sm text-[var(--mini-muted)]">
                {t9n("pub.organizedBy")} <span className="font-semibold text-[var(--mini-ink)]">{organizer.displayName}</span>
              </p>
            </div>
            <div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--mini-line)] pt-6">
                {countdownTarget ? (
                  <Fact className="col-span-2" label={t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}>
                    <span className="mini-title text-[26px] leading-none"><VoteCountdown target={countdownTarget} now={now} variant="inline" /></span>
                  </Fact>
                ) : null}
                <Fact label={t9n("hub.oneVote")}>{price}</Fact>
                <Fact label={t9n("hub.howTo.payment")}>{networks}</Fact>
              </dl>
              <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                {cta("rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)]")}
                {share("outline")}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const pill = "rounded-full border border-[var(--mini-line)] bg-white/70 px-4 py-2 text-sm";

  if (style === "terroir") {
    // Terroir : agronomie, foires, gastronomie. Couverture dans une arche, infos en étiquettes.
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <section className={`grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] ${gutter}`}>
          <div className="order-2 min-w-0 lg:order-1">
            <div className="flex flex-wrap items-center gap-4">
              <Logo url={logoUrl} className="h-16 w-16 rounded-full bg-white object-contain p-1 shadow-[0_0_0_1px_var(--mini-line)]" />
              {event.branding.tagline ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--mini-accent)]">{event.branding.tagline}</p>
              ) : null}
            </div>
            <h1 className="mini-title mini-display-xl mt-6">{event.title}</h1>
            <p className="mt-5 text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
            <ul className="mt-7 flex flex-wrap gap-2" role="list">
              <li className={pill}><StatusLine phase={phase} locale={locale} /></li>
              {countdownTarget ? (
                <li className={pill}>
                  {t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}{" "}
                  <span className="font-semibold"><VoteCountdown target={countdownTarget} now={now} variant="inline" /></span>
                </li>
              ) : null}
              <li className={pill}>{t9n("hub.oneVote")} · <span className="font-semibold">{price}</span></li>
              <li className={pill}>{networks}</li>
            </ul>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              {cta("rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)]")}
              {share("outline", "rounded-full")}
            </div>
          </div>
          <div className="relative order-1 mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-b-md rounded-t-[999px] bg-[var(--event-accent)] lg:order-2">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverSrc} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
            ) : logoUrl ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-white p-3"><Logo url={logoUrl} className="h-32 w-32 rounded-full object-contain" /></span>
              </span>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  if (style === "stade") {
    // Stade : sport, tournois. Fond nuit, couverture en biais, compte à rebours en tableau de score.
    return (
      <section className="relative overflow-hidden bg-slate-950 text-white">
        {coverSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc}
              alt=""
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover lg:left-auto lg:w-[60%] lg:[clip-path:polygon(16%_0,100%_0,100%_100%,0_100%)]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-slate-950/75 lg:bg-[linear-gradient(90deg,#020617_0%,#020617_40%,rgb(2_6_23/0.15)_70%)]" />
          </>
        ) : null}
        <div aria-hidden="true" className="absolute inset-y-0 left-[56%] hidden w-16 -skew-x-[14deg] bg-[var(--event-accent)] lg:block" />
        <div className="relative">{header("image")}</div>
        <div className={`relative max-w-3xl pb-16 pt-10 sm:pt-14 ${gutter}`}>
          <div className="flex flex-wrap items-center gap-4">
            <Logo url={logoUrl} className="h-16 w-16 rounded-sm bg-white object-contain p-1" />
            {event.branding.tagline ? (
              <span className="inline-block bg-[var(--event-header-bg)] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--event-header-fg)]">
                {event.branding.tagline}
              </span>
            ) : null}
          </div>
          <h1 className="mini-title mini-display-xl mt-6">{event.title}</h1>
          <p className="mt-5 text-sm text-white/80">{organizedBy}</p>
          <div className="mt-8">
            {countdownTarget ? (
              <>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">{countdownLabel}</p>
                <VoteCountdown target={countdownTarget} now={now} variant="board" />
              </>
            ) : (
              <p className="text-lg font-bold"><StatusLine phase={phase} locale={locale} /></p>
            )}
          </div>
          <p className="mt-6 text-sm text-white/80">
            {t9n("hub.oneVote")} · <span className="font-bold text-white">{price}</span> · {networks}
          </p>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            {cta("rounded-sm bg-[var(--event-header-bg)] uppercase tracking-[0.06em] text-[var(--event-header-fg)] focus-visible:ring-white focus-visible:ring-offset-slate-950")}
            {share("outline", "rounded-sm")}
          </div>
        </div>
      </section>
    );
  }

  if (style === "lineup") {
    // Line-up : affiche de festival. Couverture en bichromie (noir et couleur de l'événement).
    return (
      <section className="relative overflow-hidden bg-slate-950 text-center text-white">
        {coverSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverSrc} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover grayscale contrast-125" />
            <div aria-hidden="true" className="absolute inset-0 bg-[var(--event-accent)] mix-blend-multiply" />
            <div aria-hidden="true" className="absolute inset-0 bg-slate-950/45" />
          </>
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,var(--event-accent),#020617)] opacity-90" />
        )}
        <div className="relative text-left">{header("image")}</div>
        <div className={`relative mx-auto flex max-w-5xl flex-col items-center pb-20 pt-10 sm:pt-16 ${gutter}`}>
          <Logo url={logoUrl} className="mb-6 h-20 w-20 rounded-full bg-white object-contain p-1" />
          {dates ? <p className="text-xs font-bold uppercase tracking-[0.32em] text-white/85">{dates}</p> : null}
          <h1 className="mini-title mini-display-xl mt-5 text-balance">{event.title}</h1>
          {event.branding.tagline ? <p className="mt-5 text-lg font-medium text-white/90">{event.branding.tagline}</p> : null}
          {countdownTarget ? (
            <p className="mt-8 text-sm uppercase tracking-[0.2em] text-white/80">
              {t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}{" "}
              <span className="mini-title ml-1 text-2xl text-white"><VoteCountdown target={countdownTarget} now={now} variant="inline" /></span>
            </p>
          ) : (
            <p className="mt-8 font-semibold"><StatusLine phase={phase} locale={locale} /></p>
          )}
          <p className="mt-3 text-sm text-white/75">
            {t9n("hub.oneVote")} · <span className="font-semibold text-white">{price}</span> · {t9n("pub.organizedBy")} {organizer.displayName}
          </p>
          <div className="mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
            {cta("rounded-full bg-white text-slate-950 focus-visible:ring-white focus-visible:ring-offset-slate-950")}
            {share("outline", "rounded-full")}
          </div>
        </div>
      </section>
    );
  }

  if (style === "diplome") {
    // Diplôme : écoles, prix. Cadre de certificat, sceau, ornement.
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <section className={`relative overflow-hidden py-10 sm:py-14 ${gutter}`}>
          {bandImage("bg-[var(--mini-bg)] opacity-[0.9]")}
          <div className="relative mx-auto max-w-5xl bg-white p-2.5 text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.06),0_18px_40px_-20px_rgb(15_23_42/0.3)] sm:p-3">
            <div className="border-2 border-[var(--event-accent-strong)] p-1.5">
              <div className="flex flex-col items-center border border-[color-mix(in_srgb,var(--event-accent-strong)_45%,transparent)] px-5 py-10 text-center sm:px-12 sm:py-14">
                {logoUrl ? (
                  <span className="mb-6 rounded-full border-2 border-dashed border-[var(--event-accent-strong)] p-1.5">
                    <Logo url={logoUrl} className="h-24 w-24 rounded-full bg-white object-contain" />
                  </span>
                ) : null}
                {event.branding.tagline ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--event-accent-strong)]">{event.branding.tagline}</p>
                ) : null}
                <h1 className="mini-title mini-display mt-4 text-balance">{event.title}</h1>
                <div aria-hidden="true" className="my-6 flex w-full max-w-xs items-center gap-3 text-[var(--event-accent-strong)]">
                  <span className="h-px flex-1 bg-current opacity-60" />
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="h-px flex-1 bg-current opacity-60" />
                </div>
                <p className="text-[15px] text-slate-600">{organizedBy}</p>
                <p className="mt-5 text-sm text-slate-600">
                  {countdownTarget ? (
                    <>
                      {t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}{" "}
                      <span className="font-semibold text-slate-900"><VoteCountdown target={countdownTarget} now={now} variant="inline" /></span>
                      {" · "}
                    </>
                  ) : null}
                  {t9n("hub.oneVote")} · <span className="font-semibold text-slate-900">{price}</span>
                </p>
                <div className="mt-7 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
                  {cta("rounded-md bg-[var(--event-accent-strong)] text-white focus-visible:ring-[var(--event-accent-strong)]")}
                  {share("outline")}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (style === "marche") {
    // Marché : foires agricoles, produits locaux. Auvent rayé, prix sur ardoise.
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <div aria-hidden="true" className="mini-awning h-8 sm:h-12" />
        <div aria-hidden="true" className="mini-awning-edge h-5" />
        <section className={`grid items-start gap-10 pb-14 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] ${gutter}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-4">
              <Logo url={logoUrl} className="h-16 w-16 rounded-full bg-white object-contain p-1 shadow-[0_0_0_1px_var(--mini-line)]" />
              {event.branding.tagline ? (
                <p className="-rotate-2 border-2 border-dashed border-[var(--mini-accent)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--mini-accent)]">
                  {event.branding.tagline}
                </p>
              ) : null}
            </div>
            <h1 className="mini-title mini-display-xl mt-6">{event.title}</h1>
            <p className="mt-5 text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              {cta("rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)]")}
              {share("outline")}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {coverSrc ? (
              <div className="aspect-[4/3] overflow-hidden rounded-md border-[6px] border-white shadow-[0_10px_30px_-18px_rgb(60_40_20/0.6)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverSrc} alt="" fetchPriority="high" className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="mini-chalk rounded-md p-5 sm:p-6">
              <p className="text-sm text-white/85"><StatusLine phase={phase} locale={locale} /></p>
              {countdownTarget ? (
                <p className="mt-3 text-sm text-white/80">
                  {t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}{" "}
                  <span className="mini-title ml-1 text-2xl text-white"><VoteCountdown target={countdownTarget} now={now} variant="inline" /></span>
                </p>
              ) : null}
              <p className="mt-4 border-t border-dashed border-white/30 pt-4">
                <span className="mini-title text-[36px] leading-none tabular-nums">{hasPrice ? price : "—"}</span>{" "}
                {hasPrice ? <span className="text-sm text-white/80">{t9n("hub.perVote")}</span> : null}
              </p>
              <p className="mt-2 text-sm text-white/80">{networks}</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (style === "menu") {
    // Menu : gastronomie. Carte de restaurant, infos à points de conduite.
    const menuRow = (label: string, value: ReactNode) => (
      <div className="flex items-baseline gap-2 text-left">
        <dt className="shrink-0 text-sm text-slate-600">{label}</dt>
        <span aria-hidden="true" className="min-w-6 flex-1 -translate-y-1 border-b-2 border-dotted border-[var(--mini-line)]" />
        <dd className="m-0 shrink-0 text-right text-[15px] font-semibold">{value}</dd>
      </div>
    );
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <section className={`relative overflow-hidden py-10 sm:py-14 ${gutter}`}>
          {bandImage("bg-[var(--mini-bg)] opacity-[0.9]")}
          <div className="relative mx-auto max-w-3xl bg-[#fffdf7] px-6 py-12 text-center text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.06),0_18px_40px_-22px_rgb(15_23_42/0.35)] sm:px-14 sm:py-14">
            <div aria-hidden="true" className="pointer-events-none absolute inset-3 border border-[var(--mini-line)]" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-[18px] border border-[var(--mini-rule)]" />
            <div className="relative flex flex-col items-center">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverSrc} alt="" fetchPriority="high" className="mb-7 h-36 w-36 rounded-full object-cover shadow-[0_0_0_6px_#fffdf7,0_0_0_7px_var(--mini-line)] sm:h-44 sm:w-44" />
              ) : logoUrl ? (
                <Logo url={logoUrl} className="mb-7 h-24 w-24 rounded-full bg-white object-contain" />
              ) : null}
              {event.branding.tagline ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--event-accent-strong)]">{event.branding.tagline}</p>
              ) : null}
              {/* Carte étroite : taille calée sur sa largeur, coupure aux espaces et tirets. */}
              <h1 className="mini-title mini-title-nobreak mt-4 text-balance text-[calc(clamp(40px,6vw,88px)*var(--mini-title-scale))] leading-[0.95]">{event.title}</h1>
              <div aria-hidden="true" className="my-6 flex w-full max-w-[12rem] items-center gap-2 text-[var(--event-accent-strong)]">
                <span className="h-px flex-1 bg-current opacity-60" />
                <span className="h-1.5 w-1.5 rotate-45 bg-current" />
                <span className="h-px flex-1 bg-current opacity-60" />
              </div>
              <p className="text-[15px] text-slate-600">{organizedBy}</p>
              <dl className="mt-8 w-full max-w-md space-y-3">
                {menuRow(t9n("hub.status"), <StatusLine phase={phase} locale={locale} />)}
                {countdownTarget
                  ? menuRow(t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn"), <VoteCountdown target={countdownTarget} now={now} variant="inline" />)
                  : null}
                {menuRow(t9n("hub.oneVote"), price)}
                {menuRow(t9n("hub.howTo.payment"), networks)}
              </dl>
              <div className="mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
                {cta("rounded-full bg-[var(--event-accent-strong)] text-white focus-visible:ring-[var(--event-accent-strong)]")}
                {share("outline", "rounded-full")}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (style === "wax") {
    // Wax : mode africaine, patrimoine. Panneau en motif de pagne, bande kente.
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <section className="grid lg:min-h-[min(80svh,780px)] lg:grid-cols-2">
          <div className="mini-wax relative flex min-h-[44svh] items-center justify-center p-8 lg:min-h-0">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverSrc} alt="" fetchPriority="high" className="aspect-square w-[min(72vw,380px)] rounded-full border-[8px] border-[#fff7e6] object-cover shadow-[0_0_0_3px_#0f172a]" />
            ) : logoUrl ? (
              <span className="rounded-full border-[8px] border-[#fff7e6] bg-white p-3 shadow-[0_0_0_3px_#0f172a]">
                <Logo url={logoUrl} className="h-40 w-40 rounded-full object-contain sm:h-52 sm:w-52" />
              </span>
            ) : null}
          </div>
          <div className={`flex min-w-0 flex-col justify-center gap-8 py-10 sm:py-14 ${gutter}`}>
            <div className="min-w-0">
              {event.branding.tagline ? (
                <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[var(--mini-accent)]">{event.branding.tagline}</p>
              ) : null}
              <h1 className="mini-title mini-title-nobreak mt-4 text-[calc(clamp(44px,6vw,104px)*var(--mini-title-scale))] leading-[0.92]">{event.title}</h1>
              <div aria-hidden="true" className="mini-wax-band mt-6 h-2.5 w-40" />
              <p className="mt-6 text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t-2 border-[var(--mini-line)] pt-6">
              <Fact label={t9n("hub.status")}><StatusLine phase={phase} locale={locale} /></Fact>
              {countdownTarget ? (
                <Fact label={t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}>
                  <VoteCountdown target={countdownTarget} now={now} variant="inline" />
                </Fact>
              ) : null}
              <Fact label={t9n("hub.oneVote")}><span className="mini-title text-[26px] leading-none">{price}</span></Fact>
              <Fact label={t9n("hub.howTo.payment")}>{networks}</Fact>
            </dl>
            <div className="flex flex-col gap-2 sm:flex-row">
              {cta("rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)]")}
              {share("outline")}
            </div>
          </div>
        </section>
        <div aria-hidden="true" className="mini-wax-band h-3" />
      </div>
    );
  }

  if (style === "campus") {
    // Campus : écoles, jeunesse. Papier quadrillé, titre surligné, photo en polaroïd.
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <section className={`grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] ${gutter}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-4">
              <Logo url={logoUrl} className="h-16 w-16 rounded-md bg-white object-contain p-1 shadow-[0_0_0_1px_var(--mini-line)]" />
              {event.branding.tagline ? (
                <p className="-rotate-2 bg-[var(--event-accent-strong)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">{event.branding.tagline}</p>
              ) : null}
            </div>
            <h1 className="mini-title mini-display-xl mt-6">
              <span className="mini-highlight">{event.title}</span>
            </h1>
            <p className="mt-5 text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
            <div className="mini-ruled mt-8 max-w-md rounded-sm border-l-[3px] border-rose-300 bg-white py-[2px] pl-5 pr-4 text-[15px] leading-[28px] text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.08)]">
              <p><StatusLine phase={phase} locale={locale} /></p>
              {countdownTarget ? (
                <p>
                  {t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}{" "}
                  <span className="font-bold"><VoteCountdown target={countdownTarget} now={now} variant="inline" /></span>
                </p>
              ) : null}
              <p>{t9n("hub.oneVote")} · <span className="font-bold">{price}</span></p>
              <p>{networks}</p>
            </div>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              {cta("rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)]")}
              {share("outline")}
            </div>
          </div>
          {coverSrc || logoUrl ? (
            <div className="relative mx-auto w-full max-w-sm rotate-2 bg-white p-3 pb-14 shadow-[0_14px_30px_-16px_rgb(15_23_42/0.45)]">
              <span aria-hidden="true" className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-3 bg-[color-mix(in_srgb,var(--event-accent-bright)_45%,white)] opacity-90" />
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-[var(--mini-wash)]">
                {coverSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverSrc} alt="" fetchPriority="high" className="h-full w-full object-cover" />
                ) : (
                  <Logo url={logoUrl} className="h-40 w-40 object-contain" />
                )}
              </div>
              {dates ? <p className="absolute inset-x-3 bottom-4 text-center text-sm text-slate-600">{dates}</p> : null}
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  if (style === "badge") {
    // Badge : entreprise, salons, élections. Badge de conférence au cordon.
    return (
      <div>
        <div className="border-b border-[var(--mini-line)]">{header("page")}</div>
        <section className={`grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] ${gutter}`}>
          <div className="min-w-0">
            {event.branding.tagline ? (
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mini-accent)]">
                <span aria-hidden="true" className="h-2 w-2 bg-current" />
                {event.branding.tagline}
              </p>
            ) : null}
            <h1 className="mini-title mini-display-xl mt-5">{event.title}</h1>
            <p className="mt-5 text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
            <dl className="mt-8 grid grid-cols-2 border-l border-t border-[var(--mini-line)] bg-white sm:grid-cols-3">
              {countdownTarget ? (
                <Fact className="col-span-2 border-b border-r border-[var(--mini-line)] p-4 sm:col-span-1" label={t9n(phase === "open" ? "countdown.endsIn" : "countdown.startsIn")}>
                  <VoteCountdown target={countdownTarget} now={now} variant="inline" />
                </Fact>
              ) : null}
              <Fact className="border-b border-r border-[var(--mini-line)] p-4" label={t9n("hub.oneVote")}>{price}</Fact>
              <Fact className="border-b border-r border-[var(--mini-line)] p-4" label={t9n("hub.howTo.payment")}>{networks}</Fact>
            </dl>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              {cta("rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)]")}
              {share("outline")}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[19rem] pt-16">
            {/* Cordon : deux bandes à la couleur de l'événement. */}
            <span aria-hidden="true" className="absolute left-[30%] top-0 h-24 w-5 -rotate-[18deg] bg-[var(--event-header-bg)]" />
            <span aria-hidden="true" className="absolute right-[30%] top-0 h-24 w-5 rotate-[18deg] bg-[var(--event-header-bg)]" />
            <div className="relative overflow-hidden rounded-xl bg-white text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.1),0_22px_40px_-20px_rgb(15_23_42/0.45)]">
              <span aria-hidden="true" className="mx-auto mt-4 block h-2 w-14 rounded-full bg-slate-200" />
              <div className="flex flex-col items-center px-6 pb-6 pt-5 text-center">
                <div className="flex aspect-square w-40 items-center justify-center overflow-hidden rounded-full bg-[var(--mini-wash)] shadow-[0_0_0_4px_white,0_0_0_6px_var(--event-accent-strong)]">
                  {coverSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverSrc} alt="" fetchPriority="high" className="h-full w-full object-cover" />
                  ) : (
                    <Logo url={logoUrl} className="h-28 w-28 object-contain" />
                  )}
                </div>
                <p className="mt-5 text-sm font-semibold">{organizer.displayName}</p>
                <p className="mt-1 text-[13px] text-slate-600"><StatusLine phase={phase} locale={locale} /></p>
              </div>
              <p className="bg-[var(--event-header-bg)] px-6 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-[var(--event-header-fg)]">
                {dates ?? t9n("hub.status")}
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (style === "story") {
    // Story : médias, créateurs. Fond nuit, couverture en format vertical.
    return (
      <section className="relative overflow-hidden">
        {coverSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverSrc} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />
            <div aria-hidden="true" className="absolute inset-0 bg-[var(--mini-bg)] opacity-60" />
          </>
        ) : null}
        <div className="relative border-b border-[var(--mini-rule)]">{header("page")}</div>
        <div className={`relative grid items-center gap-10 pb-16 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_auto] ${gutter}`}>
          <div className="order-2 min-w-0 lg:order-1">
            {event.branding.tagline ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--mini-accent)]">{event.branding.tagline}</p>
            ) : null}
            <h1 className="mini-title mini-display-xl mt-4">{event.title}</h1>
            <p className="mt-5 text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
            <div className="mt-8 max-w-md">
              {countdownTarget ? (
                <>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mini-muted)]">{countdownLabel}</p>
                  <VoteCountdown target={countdownTarget} now={now} variant="cells" />
                </>
              ) : (
                <p className="text-lg"><StatusLine phase={phase} locale={locale} /></p>
              )}
            </div>
            <p className="mt-6 text-sm text-[var(--mini-muted)]">
              {t9n("hub.oneVote")} · <span className="font-semibold text-[var(--mini-ink)]">{price}</span> · {networks}
            </p>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              {cta("rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-[var(--mini-bg)]")}
              {share("outline", "rounded-full")}
            </div>
          </div>
          <div className="mini-story-ring order-1 mx-auto w-[min(56vw,280px)] rounded-[30px] p-[3px] lg:order-2">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[27px] bg-[linear-gradient(180deg,var(--event-accent),#020617)]">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : logoUrl ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-white p-2"><Logo url={logoUrl} className="h-24 w-24 rounded-full object-contain" /></span>
                </span>
              ) : null}
              <span aria-hidden="true" className="absolute inset-x-3 top-3 flex gap-1">
                <span className="h-[3px] flex-1 rounded-full bg-white" />
                <span className="h-[3px] flex-1 rounded-full bg-white/40" />
                <span className="h-[3px] flex-1 rounded-full bg-white/40" />
              </span>
              {coverSrc && logoUrl ? (
                <Logo url={logoUrl} className="absolute left-3 top-6 h-9 w-9 rounded-full bg-white object-contain ring-2 ring-white" />
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (style === "sanctuaire") {
    // Sanctuaire : chorales, foi. Fond nuit, halo de lumière, couverture en arche.
    return (
      <section className="relative overflow-hidden text-center">
        <div aria-hidden="true" className="mini-halo absolute inset-0" />
        <div className="relative text-left">{header("page")}</div>
        <div className={`relative mx-auto flex max-w-4xl flex-col items-center pb-16 pt-6 sm:pb-20 sm:pt-10 ${gutter}`}>
          {coverSrc ? (
            <div className="mb-8 rounded-t-full p-1.5 shadow-[0_0_0_1px_var(--mini-line)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverSrc} alt="" fetchPriority="high" className="aspect-[3/4] w-[min(64vw,300px)] rounded-t-full object-cover" />
            </div>
          ) : logoUrl ? (
            <span className="mb-8 rounded-full bg-white p-2 shadow-[0_0_0_1px_var(--mini-line),0_0_0_7px_var(--mini-bg),0_0_0_8px_var(--mini-line)]">
              <Logo url={logoUrl} className="h-24 w-24 rounded-full object-contain sm:h-28 sm:w-28" />
            </span>
          ) : null}
          {event.branding.tagline ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--mini-accent)]">{event.branding.tagline}</p>
          ) : null}
          <h1 className="mini-title mini-display mt-4 text-balance">{event.title}</h1>
          <span aria-hidden="true" className="my-7 h-12 w-px bg-[linear-gradient(180deg,var(--mini-accent),transparent)]" />
          <p className="text-[15px] text-[var(--mini-muted)]">{organizedBy}</p>
          {countdownTarget ? (
            <div className="mt-9 w-full max-w-md">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mini-muted)]">{countdownLabel}</p>
              <VoteCountdown target={countdownTarget} now={now} variant="cells" />
            </div>
          ) : (
            <p className="mt-8 text-base font-medium"><StatusLine phase={phase} locale={locale} /></p>
          )}
          <p className="mt-6 text-sm text-[var(--mini-muted)]">
            {t9n("hub.oneVote")} · <span className="font-semibold text-[var(--mini-ink)]">{price}</span> · {networks}
          </p>
          <div className="mt-7 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
            {cta("rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-[var(--mini-bg)]")}
            {share("outline", "rounded-full")}
          </div>
        </div>
      </section>
    );
  }

  if (style === "pop") {
    // Pop : aplat vif, contours encre et ombres franches, façon affiche sérigraphiée.
    const popBox = "rounded-md border-[3px] border-slate-900 bg-white text-slate-900 shadow-[6px_6px_0_0_#0f172a]";
    return (
      <div>
        <div className="relative overflow-hidden border-b-[3px] border-slate-900 bg-[var(--event-header-bg)] text-[var(--event-header-fg)]">
          {bandImage("bg-[var(--event-header-bg)] opacity-[0.84]")}
          {header("accent")}
          <div className={`relative pb-14 pt-6 sm:pt-10 ${gutter}`}>
            <div className="flex flex-wrap items-center gap-4">
              <Logo url={logoUrl} className="h-20 w-20 rounded-md border-[3px] border-slate-900 bg-white object-contain p-1 shadow-[4px_4px_0_0_#0f172a]" />
              {event.branding.tagline ? (
                <span className="inline-block bg-slate-900 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white">{event.branding.tagline}</span>
              ) : null}
            </div>
            <h1 className="mini-title mini-display-xl mt-6">{event.title}</h1>
            <p className="mt-5 text-[15px] font-semibold">{organizedBy}</p>
          </div>
        </div>
        <section className={`grid gap-6 pb-4 pt-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] ${gutter}`}>
          <div className={`${popBox} p-6`}>
            {countdownTarget ? (
              <>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em]">{countdownLabel}</p>
                <VoteCountdown target={countdownTarget} now={now} variant="cells" />
              </>
            ) : (
              <p className="text-lg font-bold"><StatusLine phase={phase} locale={locale} /></p>
            )}
            <p className="mt-5 text-sm text-slate-600">{t9n("hub.howTo.countsValue")}</p>
          </div>
          <div className={`${popBox} flex flex-col gap-4 p-6`}>
            <p>
              <span className="mini-title text-[40px] leading-none tabular-nums">{hasPrice ? price : "—"}</span>{" "}
              {hasPrice ? <span className="text-sm font-semibold text-slate-600">{t9n("hub.perVote")}</span> : null}
            </p>
            <p className="text-sm font-medium">{networks}</p>
            {cta("rounded-md border-[3px] border-slate-900 bg-[var(--event-header-bg)] text-[var(--event-header-fg)] shadow-[4px_4px_0_0_#0f172a] focus-visible:ring-slate-900")}
            {share("outline", "border-2 border-slate-900")}
          </div>
        </section>
      </div>
    );
  }

  if (style === "soiree") {
    return (
      <div>
        <div className="relative overflow-hidden">
        {bandImage("bg-[var(--mini-bg)] opacity-[0.82]")}
        <div className="relative border-b border-[var(--mini-rule)]">{header("page")}</div>
        <section className={`relative grid items-end gap-12 pb-16 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] ${gutter}`}>
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
            {share("outline", "mt-3 w-full")}
          </div>
        </section>
        </div>
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
        <div className="relative overflow-hidden border-b border-[var(--mini-rule)] bg-[var(--event-header-bg)] text-[var(--event-header-fg)]">
          {bandImage("bg-[var(--event-header-bg)] opacity-[0.84]")}
          {header("accent")}
          <div className={`relative grid items-start gap-8 pb-28 pt-10 sm:pt-14 md:grid-cols-[minmax(0,1fr)_auto] ${gutter}`}>
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
            {share("outline", "-mt-1 w-full")}
          </div>
        </section>
      </div>
    );
  }

  // Affiche : photo de couverture derrière le titre ; sans photo, fond encre.
  return (
    <section className="relative flex min-h-[min(88svh,820px)] flex-col bg-slate-900 text-white">
      {coverSrc ? (
        // Couverture importée par l'organisateur ; décorative (le titre la décrit).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverSrc}
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
        {/* Les boutons restent hors du <dl> (qui n'admet que des paires terme/définition) ; `contents` garde la grille. */}
        <div className="grid grid-cols-2 items-end gap-6 border-t border-white/35 pt-6 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <dl className="contents">
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
        </dl>
          <div className="col-span-2 flex flex-col gap-2 sm:flex-row lg:col-span-1 lg:flex-col">
            {cta("w-full rounded-md bg-[var(--event-header-bg)] text-[var(--event-header-fg)] focus-visible:ring-white focus-visible:ring-offset-slate-900")}
            {share("outline", "w-full")}
          </div>
        </div>
      </div>
    </section>
  );
}
