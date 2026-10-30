"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";
import type { MessageKey } from "../lib/i18n";
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

  // Ancres de la page d'accueil : seulement sur « / ».
  const anchors: Array<{ href: string; label: MessageKey }> =
    pathname === "/"
      ? [
          { href: "#fonctions", label: "home.l.nav.features" },
          { href: "#comment", label: "home.l.nav.how" },
          { href: "#argent", label: "home.l.nav.money" }
        ]
      : [];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/85 text-slate-900 backdrop-blur-md" role="banner">
      <div className="mx-auto flex h-16 w-[min(1160px,100%-2rem)] items-center justify-between gap-4">
        <Link href="/" className="font-display text-lg font-extrabold tracking-[0.04em] text-slate-900" aria-label="SHADOMA">
          SHADOMA
        </Link>

        {anchors.length ? (
          <nav className="hidden items-center gap-7 text-sm font-medium lg:flex" aria-label={t("home.nav.label")}>
            {anchors.map((anchor) => (
              <a key={anchor.href} href={anchor.href} className="inline-flex min-h-11 items-center text-slate-600 transition-colors hover:text-slate-900">
                {t(anchor.label)}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href={authLoginUrl()}
            onClick={(event) => {
              event.preventDefault();
              handleOpenAuth("login");
            }}
            className="hidden min-h-11 items-center text-sm font-semibold text-slate-700 hover:text-slate-900 sm:inline-flex"
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
            className="hidden h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 sm:inline-flex"
            prefetch={false}
          >
            {t("home.cta")}
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-slate-900 sm:hidden"
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
        <nav id="marketing-mobile-menu" className="border-t border-border bg-white px-5 py-3 sm:hidden" aria-label={t("home.nav.label")}>
          <ul className="space-y-2">
            {anchors.map((anchor) => (
              <li key={anchor.href}>
                <a href={anchor.href} className="flex min-h-11 items-center text-sm font-semibold text-slate-900" onClick={() => setMobileOpen(false)}>
                  {t(anchor.label)}
                </a>
              </li>
            ))}
            <li>
              <Link
                href={authLoginUrl()}
                className="flex min-h-11 items-center text-sm font-semibold text-slate-900"
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
