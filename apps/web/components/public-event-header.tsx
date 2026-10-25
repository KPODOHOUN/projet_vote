"use client";

import Link from "next/link";
import { useState } from "react";

import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";

export type MinisitePage = "candidates" | "results" | "tickets";

type PublicEventHeaderProps = {
  eventTitle: string;
  slug: string;
  logoUrl?: string | null;
  active?: MinisitePage | undefined;
  showResults?: boolean;
  ticketsHref?: string | undefined;
};

// Langage de la maquette « 3 · Résultats » : nav en capitales espacées, filet
// d'accent sous l'onglet actif. L'accent est la version lisible de la couleur
// de l'événement (--event-accent-strong), jamais la couleur brute.
const navLink =
  "inline-flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] text-slate-900 hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-accent-strong)]";

/** En-tête des mini-plateformes : identique pour tous les événements. */
export function PublicEventHeader({ eventTitle, slug, logoUrl, active, showResults = true, ticketsHref }: PublicEventHeaderProps) {
  const { t } = useI18n();
  const [logoBroken, setLogoBroken] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoBroken;

  const item = (page: MinisitePage, href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === page ? "page" : undefined}
      className={navLink}
    >
      <span
        className="pb-1"
        style={active === page ? { borderBottom: "1px solid var(--event-accent-strong)" } : undefined}
      >
        {label}
      </span>
    </Link>
  );

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[clamp(20px,4vw,56px)] py-4 sm:py-5">
      <Link
        href={`/e/${slug}`}
        className="flex min-h-11 min-w-0 items-center gap-3 text-slate-900 hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-accent-strong)]"
      >
        {showLogo ? (
          // Logo de taille fixe servi par Cloudinary : <img> suffit ici.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl!} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md object-cover" onError={() => setLogoBroken(true)} />
        ) : null}
        <span className="truncate font-display text-base font-medium uppercase tracking-[0.3em] sm:text-lg sm:tracking-[0.4em]">
          {eventTitle}
        </span>
      </Link>
      <nav aria-label={t("publicEvent.nav")} className="flex flex-wrap items-center gap-x-6 gap-y-1 sm:gap-x-8">
        {item("candidates", `/e/${slug}`, t("minisite.candidates"))}
        {showResults ? item("results", `/e/${slug}/results`, t("minisite.results")) : null}
        {ticketsHref ? item("tickets", ticketsHref, t("minisite.tickets")) : null}
        <LanguageSwitcher />
      </nav>
    </header>
  );
}

/** Pied à fond encre (maquette) : titre de l'événement en grand, mention SHADOMA. */
export function PublicEventFooter({ eventTitle }: { eventTitle: string }) {
  const { t } = useI18n();
  return (
    <footer className="flex flex-wrap items-end justify-between gap-6 bg-slate-900 px-[clamp(20px,4vw,56px)] pb-11 pt-14 text-white">
      <span className="max-w-full break-words font-display text-[clamp(32px,6vw,88px)] font-light uppercase leading-[0.9] tracking-[0.1em]">
        {eventTitle}
      </span>
      <Link href="/" className="text-[13px] font-light text-white/75 hover:opacity-65">
        {t("minisite.hostedBy")}
      </Link>
    </footer>
  );
}
