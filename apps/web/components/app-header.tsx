"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type React from "react";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";
import { authLoginUrl, authRegisterUrl } from "../lib/auth-navigation";
import { useAuthModal } from "./auth/auth-modal-provider";
import type { AuthMode } from "./auth/auth-dialog";

/** Header marketing : wordmark, langue, « Connexion » en lien, un seul CTA. Aplat opaque, sans verre. */
export function AppHeader() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { openAuth } = useAuthModal();

  const handleOpenAuth = (mode: AuthMode) => {
    setMobileOpen(false);
    openAuth(mode);
  };

  if (
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/vote") ||
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/check-email") ||
    pathname?.startsWith("/verify-email") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password")
  ) {
    return null;
  }

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/10 bg-slate-900 text-white"
      role="banner"
      // Le sélecteur de langue « brand-header » lit ces deux variables.
      style={{ "--event-header-bg": "#0f172a", "--event-header-fg": "#ffffff" } as React.CSSProperties}
    >
      <div className="flex h-16 items-center justify-between gap-4 px-5 md:px-16">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-white" aria-label="SHADOMA">
          SHADOMA
        </Link>

        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="brand-header" />
          <Link
            href={authLoginUrl()}
            onClick={(event) => {
              event.preventDefault();
              handleOpenAuth("login");
            }}
            className="hidden min-h-11 items-center text-sm font-semibold text-white/90 underline-offset-4 hover:underline sm:inline-flex"
            prefetch={false}
          >
            {t("home.login")}
          </Link>
          <Link
            href={authRegisterUrl()}
            onClick={(event) => {
              event.preventDefault();
              handleOpenAuth("register");
            }}
            className="hidden h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-flex"
            prefetch={false}
          >
            {t("home.cta")}
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/20 text-white sm:hidden"
            aria-label={mobileOpen ? t("home.menu.close") : t("home.menu.open")}
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-menu"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav id="marketing-mobile-menu" className="border-t border-white/10 px-5 py-3 sm:hidden" aria-label={t("home.nav.label")}>
          <ul className="space-y-2">
            <li>
              <Link
                href={authLoginUrl()}
                className="flex min-h-11 items-center text-sm font-semibold text-white"
                onClick={(event) => {
                  event.preventDefault();
                  handleOpenAuth("login");
                }}
              >
                {t("home.login")}
              </Link>
            </li>
            <li>
              <Link
                href={authRegisterUrl()}
                className="flex h-11 items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white"
                onClick={(event) => {
                  event.preventDefault();
                  handleOpenAuth("register");
                }}
              >
                {t("home.cta")}
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
