"use client";

import Link from "next/link";
import { useState } from "react";

import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";
import { SITE_NAME } from "../lib/site";

type PublicEventHeaderProps = {
  eventTitle: string;
  logoUrl?: string | null;
  tagline?: string | null;
  resultsHref?: string | undefined;
  ticketsHref?: string | undefined;
  homeHref?: string | undefined;
};

/**
 * En-tête d'un concours (7.11-b) : aplat --event-header-bg / --event-header-fg
 * calculés par le moteur de thème (contraste ≥ 4,5:1), filet de 1 px, sans
 * dégradé ni animation.
 */
export function PublicEventHeader({ eventTitle, logoUrl, tagline, resultsHref, ticketsHref, homeHref }: PublicEventHeaderProps) {
  const { t } = useI18n();
  const [logoBroken, setLogoBroken] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoBroken;

  const brandingElement = (
    <div className="flex min-w-0 items-center gap-3">
      {showLogo ? (
        // Logo Cloudinary de taille fixe : <img> suffit, next/image n'apporte rien ici.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl!}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-md object-cover"
          onError={() => setLogoBroken(true)}
        />
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xs font-extrabold"
          style={{ background: "color-mix(in srgb, var(--event-header-fg) 15%, transparent)" }}
          aria-hidden="true"
        >
          {eventTitle.slice(0, 2).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <span className="block truncate text-base font-bold leading-tight">{eventTitle}</span>
        {tagline ? <span className="mt-0.5 block truncate text-xs leading-tight">{tagline}</span> : null}
      </div>
    </div>
  );

  const linkClass =
    "inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";

  return (
    <header
      className="sticky top-0 z-40 w-full border-b"
      style={{
        background: "var(--event-header-bg)",
        color: "var(--event-header-fg)",
        borderColor: "color-mix(in srgb, var(--event-header-fg) 20%, transparent)"
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {homeHref ? (
          <Link href={homeHref} className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">
            {brandingElement}
          </Link>
        ) : (
          brandingElement
        )}
        <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label={t("publicEvent.nav")}>
          {ticketsHref ? (
            <Link href={ticketsHref} className={linkClass}>
              {t("publicEvent.tickets")}
            </Link>
          ) : null}
          {resultsHref ? (
            <Link href={resultsHref} className={linkClass}>
              {t("publicEvent.results")}
            </Link>
          ) : null}
          <LanguageSwitcher variant="brand-header" />
        </nav>
      </div>
    </header>
  );
}

export function PublicEventFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border bg-background py-6">
      <p className="mx-auto max-w-6xl px-4 text-xs text-slate-600 sm:px-6">
        {t("publicEvent.hostedBy")}{" "}
        <Link href="/" className="font-semibold text-slate-900 underline-offset-4 hover:underline">
          {SITE_NAME}
        </Link>
      </p>
    </footer>
  );
}
