"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";

export type MinisitePage = "candidates" | "results" | "tickets";

/**
 * Fond sur lequel l'en-tête est posé :
 * - "page" : fond de la page (clair, ou nuit pour le style Soirée) ;
 * - "image" : par-dessus la photo de couverture (style Affiche) ;
 * - "accent" : sur l'aplat de la couleur de l'événement (style Billet).
 */
export type HeaderTone = "page" | "image" | "accent";

type PublicEventHeaderProps = {
  eventTitle: string;
  slug: string;
  logoUrl?: string | null;
  active?: MinisitePage | undefined;
  showResults?: boolean;
  ticketsHref?: string | undefined;
  tone?: HeaderTone;
};

// Couleur de texte et fond de référence par fond (le sélecteur de langue les lit).
const TONE_VARS: Record<HeaderTone, CSSProperties | undefined> = {
  page: { "--event-header-fg": "var(--mini-ink)", "--event-header-bg": "var(--mini-bg)" } as CSSProperties,
  image: { "--event-header-fg": "#ffffff", "--event-header-bg": "#0f172a" } as CSSProperties,
  accent: undefined
};

// Langage de la maquette « 3 · Résultats » : nav en capitales espacées, filet
// sous l'onglet actif, dans la couleur du texte de l'en-tête.
const navLink =
  "inline-flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";

/** En-tête des mini-plateformes : même structure pour tous les événements. */
export function PublicEventHeader({
  eventTitle,
  slug,
  logoUrl,
  active,
  showResults = true,
  ticketsHref,
  tone = "page"
}: PublicEventHeaderProps) {
  const { t } = useI18n();
  const [logoBroken, setLogoBroken] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoBroken;

  const item = (page: MinisitePage, href: string, label: string) => (
    <Link href={href} aria-current={active === page ? "page" : undefined} className={navLink}>
      <span className="pb-1" style={active === page ? { borderBottom: "2px solid currentColor" } : undefined}>
        {label}
      </span>
    </Link>
  );

  return (
    <header
      className="relative z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[clamp(20px,4vw,56px)] py-4 text-[var(--event-header-fg)] sm:py-5"
      style={TONE_VARS[tone]}
    >
      <Link
        href={`/e/${slug}`}
        className="flex min-h-11 min-w-0 items-center gap-3 hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        {showLogo ? (
          // Logo de taille fixe servi par Cloudinary : <img> suffit ici.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl!}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-md bg-white object-contain p-0.5"
            onError={() => setLogoBroken(true)}
          />
        ) : null}
        <span className="truncate text-base font-semibold uppercase tracking-[0.3em] sm:text-lg sm:tracking-[0.4em]">
          {eventTitle}
        </span>
      </Link>
      <nav aria-label={t("publicEvent.nav")} className="flex flex-wrap items-center gap-x-6 gap-y-1 sm:gap-x-8">
        {item("candidates", `/e/${slug}`, t("minisite.candidates"))}
        {showResults ? item("results", `/e/${slug}/results`, t("minisite.results")) : null}
        {ticketsHref ? item("tickets", ticketsHref, t("minisite.tickets")) : null}
        <LanguageSwitcher variant="brand-header" />
      </nav>
    </header>
  );
}

/** Pied (maquette) : titre de l'événement en grand, mention SHADOMA. Encre, ou nuit en Soirée. */
export function PublicEventFooter({ eventTitle }: { eventTitle: string }) {
  const { t } = useI18n();
  return (
    <footer className="flex flex-wrap items-end justify-between gap-6 border-t border-[var(--mini-line)] bg-slate-900 px-[clamp(20px,4vw,56px)] pb-11 pt-14 text-white [[data-page-style=soiree]_&]:bg-[var(--mini-bg)]">
      <span className="mini-title mini-footer-title max-w-full [[data-page-style=soiree]_&]:text-[var(--mini-accent)]">
        {eventTitle}
      </span>
      <Link href="/" className="text-[13px] font-light text-white/75 hover:opacity-65">
        {t("minisite.hostedBy")}
      </Link>
    </footer>
  );
}
