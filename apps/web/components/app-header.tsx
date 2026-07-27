"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";
import { authRegisterUrl } from "../lib/auth-navigation";
import { useAuthModal } from "./auth/auth-modal-provider";
import type { AuthMode } from "./auth/auth-dialog";

export function AppHeader() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const isHome = pathname === "/";
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

  const sectionLinks = [
    { key: "hero", fr: "Accueil", en: "Home" },
    { key: "comment-ca-marche", fr: "Comment ça marche", en: "How it works" },
    { key: "offres", fr: "Offres", en: "Offers" },
    { key: "billetterie", fr: "Billetterie", en: "Ticketing" },
    { key: "faq", fr: "FAQ", en: "FAQ" }
  ];

  const isAdmin = pathname?.startsWith("/admin");

  return (
    <header className="sticky top-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-6xl rounded-2xl border border-white/20 bg-black/40 backdrop-blur-xl shadow-lg shadow-black/20 transition-all duration-300 px-5 py-3 min-[721px]:px-6 min-[721px]:py-3" role="banner">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-90 shrink-0" aria-label="SHADOMA Votes">
          <Image src="/logo-mark.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-lg shadow-sm" priority />
          <div className="flex flex-col">
            <strong className="text-sm font-extrabold leading-none tracking-tight text-white">SHADOMA</strong>
            <small className="mt-1 text-[9px] font-bold uppercase tracking-wider leading-none text-brand-300">
              {isEn ? "Vote Platform" : "Plateforme de vote"}
            </small>
          </div>
        </Link>

        <nav className="hidden min-[721px]:flex items-center gap-6 lg:gap-8 text-sm font-semibold flex-1 justify-center" aria-label={isEn ? "Main navigation" : "Navigation principale"}>
          {sectionLinks.map((item) => (
            <Link key={item.key} href={item.key === "billetterie" ? "/vote" : isHome ? `#${item.key}` : `/#${item.key}`} className="text-white/80 transition-colors hover:text-white relative py-1 group whitespace-nowrap">
              {isEn ? item.en : item.fr}
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-400 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-250" />
            </Link>
          ))}
          <Link href="/admin" className="text-white/40 text-xs transition-colors hover:text-white/70 relative py-1 group whitespace-nowrap">
            Admin
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-white/30 scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-250" />
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <LanguageSwitcher />
          <Link
            href={authRegisterUrl()}
            onClick={(event) => {
              event.preventDefault();
              handleOpenAuth("register");
            }}
            className="hidden h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:inline-flex"
            prefetch={false}
          >
            {isEn ? "Start" : "Démarrer"}
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white min-[721px]:hidden"
            aria-label={mobileOpen ? (isEn ? "Close menu" : "Fermer le menu") : isEn ? "Open menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="mt-3 border-t border-white/10 pt-3 min-[721px]:hidden" aria-label={isEn ? "Mobile navigation" : "Navigation mobile"}>
          <ul className="space-y-1">
            {sectionLinks.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.key === "billetterie" ? "/vote" : isHome ? `#${item.key}` : `/#${item.key}`}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
                  onClick={() => setMobileOpen(false)}
                >
                  {isEn ? item.en : item.fr}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={authRegisterUrl()}
                className="block rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground mt-2"
                onClick={(event) => {
                  event.preventDefault();
                  handleOpenAuth("register");
                }}
              >
                {isEn ? "Start" : "Démarrer"}
              </Link>
            </li>
            <li>
              <Link href="/admin" className="block rounded-lg px-3 py-2 text-xs font-medium text-white/40 hover:bg-white/10 mt-2" onClick={() => setMobileOpen(false)}>
                Admin
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
