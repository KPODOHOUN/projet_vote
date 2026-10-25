"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

import { LanguageSwitcher } from "../lib/i18n-provider";
import { buildEventTheme } from "../lib/brand";
import { SITE_NAME } from "../lib/site";

type PublicEventHeaderProps = {
  isEn?: boolean;
  eventTitle: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  tagline?: string | null;
  resultsHref?: string | undefined;
  homeHref?: string | undefined;
};

export function PublicEventHeader({
  isEn = false,
  eventTitle,
  logoUrl,
  brandColor,
  tagline,
  resultsHref,
  homeHref
}: PublicEventHeaderProps) {
  const theme = buildEventTheme(brandColor);
  const [logoBroken, setLogoBroken] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const showLogo = Boolean(logoUrl) && !logoBroken;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const brandingElement = (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl!}
          alt=""
          className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-xl border object-cover shadow-sm"
          style={{ borderColor: `${theme.headerFg}30` }}
          onError={() => setLogoBroken(true)}
        />
      ) : (
        <span
          className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black shadow-sm"
          style={{
            background: `${theme.headerFg}15`,
            border: `1px solid ${theme.headerFg}20`
          }}
          aria-hidden="true"
        >
          {eventTitle.slice(0, 2).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <span className="block truncate text-sm font-bold sm:text-base leading-tight">{eventTitle}</span>
        {tagline && (
          <span className="block truncate text-[10px] sm:text-xs opacity-75 leading-tight mt-0.5">
            {tagline}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled ? "shadow-lg" : "shadow-sm"
      }`}
      style={{
        background: theme.headerBg,
        color: theme.headerFg
      }}
    >
      <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between gap-3 sm:gap-4 px-3 sm:px-6">
        {homeHref ? (
          <Link href={homeHref} className="min-w-0 transition-opacity hover:opacity-90">
            {brandingElement}
          </Link>
        ) : (
          brandingElement
        )}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {resultsHref ? (
            <Link
              href={resultsHref}
              className="inline-flex items-center rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm font-bold transition-all hover:scale-105 hover:shadow-md"
              style={{
                background: `${theme.headerFg}15`,
                color: theme.headerFg
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `${theme.headerFg}25`)}
              onMouseLeave={(e) => (e.currentTarget.style.background = `${theme.headerFg}15`)}
            >
              <span className="mr-1 sm:mr-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-current opacity-70" />
              <span className="hidden sm:inline">{isEn ? "Live results" : "Classement"}</span>
              <span className="sm:hidden">{isEn ? "Results" : "Scores"}</span>
            </Link>
          ) : null}
          <LanguageSwitcher variant="brand-header" />
        </div>
      </div>
    </header>
  );
}

export function PublicEventFooter({ isEn = false }: { isEn?: boolean }) {
  return (
    <footer className="border-t border-border/40 bg-background/80 py-6 text-center">
      <p className="text-xs text-muted-foreground">
        {isEn ? "Powered by" : "Propulsé par"}{" "}
        <Link href="/" className="font-semibold text-foreground hover:text-primary transition-colors">
          {SITE_NAME}
        </Link>
      </p>
    </footer>
  );
}
