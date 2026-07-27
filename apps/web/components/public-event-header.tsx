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
};

export function PublicEventHeader({
  isEn = false,
  eventTitle,
  logoUrl,
  brandColor,
  tagline,
  resultsHref
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

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled ? "shadow-lg" : "shadow-sm"
      }`}
      style={{
        background: scrolled
          ? `linear-gradient(135deg, ${theme.headerBg} 0%, ${theme.accentAlt} 100%)`
          : theme.headerBg,
        color: theme.headerFg
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl!}
              alt=""
              className="h-10 w-10 shrink-0 rounded-xl border object-cover shadow-sm"
              style={{ borderColor: `${theme.headerFg}30` }}
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black shadow-sm"
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
            <span className="block truncate text-sm font-bold sm:text-base">{eventTitle}</span>
            {tagline && (
              <span className="block truncate text-[11px] opacity-75 sm:text-xs">
                {tagline}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {resultsHref ? (
            <Link
              href={resultsHref}
              className="inline-flex items-center rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold transition-all hover:scale-105 hover:shadow-md"
              style={{
                background: `${theme.headerFg}15`,
                color: theme.headerFg
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = `${theme.headerFg}25`}
              onMouseLeave={(e) => e.currentTarget.style.background = `${theme.headerFg}15`}
            >
              <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-current opacity-70" />
              {isEn ? "Live results" : "Classement"}
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
