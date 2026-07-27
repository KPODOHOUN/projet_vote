"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "../lib/i18n-provider";

export function LegalFooter() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const year = new Date().getFullYear();
  const hideOnAppRoutes =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/vote") ||
    pathname?.startsWith("/accept-invitation") ||
    pathname?.startsWith("/admin");

  if (hideOnAppRoutes) {
    return null;
  }

  return (
    <footer className="bg-brand-900 text-neutral-300" aria-label={isEn ? "Site footer" : "Pied de page"}>
      {/* Thin brand accent line at the very top of the footer. */}
      <div className="h-1 w-full bg-gradient-to-r from-brand-500 via-brand-400 to-brand-600" aria-hidden="true" />
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="flex flex-col lg:flex-row lg:justify-between gap-12 lg:gap-16 pb-12 border-b border-white/10">
          <div className="max-w-sm space-y-6">
            <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80" aria-label="SHADOMA Votes">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-white text-sm tracking-tighter" aria-hidden="true">SV</span>
              <div className="flex flex-col">
                <strong className="text-sm font-bold leading-none tracking-tight text-white">SHADOMA Votes</strong>
                <small className="text-[10px] font-medium leading-none text-neutral-400 mt-1">{isEn ? "Trusted voting platform" : "Plateforme de vote de confiance"}</small>
              </div>
            </Link>
            <p className="text-sm text-neutral-400 leading-relaxed max-w-sm">
              {isEn
                ? "Operations-grade voting infrastructure for organizers, partners, and platform admins across West Africa."
                : "Infrastructure de vote opérationnelle pour organisateurs, partenaires et administrateurs plateforme en Afrique de l'Ouest."}
            </p>
            <form
              className="flex gap-2 max-w-sm"
              onSubmit={(e) => e.preventDefault()}
              aria-label={isEn ? "Newsletter signup" : "Inscription à la newsletter"}
            >
              <input
                type="email"
                required
                className="flex h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                placeholder={isEn ? "you@company.com" : "vous@entreprise.com"}
                aria-label={isEn ? "Email address" : "Adresse e-mail"}
              />
              <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:pointer-events-none disabled:opacity-50">
                {isEn ? "Subscribe" : "S'inscrire"}
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-row gap-10 sm:gap-14 lg:gap-16">
            <div className="space-y-4">
              <h4 className="text-xs font-bold tracking-wider uppercase text-white">{isEn ? "Product" : "Produit"}</h4>
              <div className="flex flex-col gap-2.5">
                <Link href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">{isEn ? "Home" : "Accueil"}</Link>
                <Link href="/vote" className="text-sm text-neutral-400 hover:text-white transition-colors">{isEn ? "Access an event" : "Accéder à un évènement"}</Link>
                <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-white transition-colors">{isEn ? "Dashboard" : "Tableau de bord"}</Link>
                <Link href="/#offres" className="text-sm text-neutral-400 hover:text-white transition-colors">
                  {isEn ? "Pricing" : "Tarification"}
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold tracking-wider uppercase text-white">{isEn ? "Resources" : "Ressources"}</h4>
              <div className="flex flex-col gap-2.5">
                <Link href="/legal" className="text-sm text-neutral-400 hover:text-white transition-colors">{isEn ? "Legal notice" : "Mentions légales"}</Link>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold tracking-wider uppercase text-white">{isEn ? "Legal" : "Légal"}</h4>
              <div className="flex flex-col gap-2.5">
                <Link href="/privacy" className="text-sm text-neutral-400 hover:text-white transition-colors">{isEn ? "Privacy" : "Confidentialité"}</Link>
                <Link href="/terms" className="text-sm text-neutral-400 hover:text-white transition-colors">{isEn ? "Terms" : "Conditions"}</Link>
                <Link href="/cookies" className="text-sm text-neutral-400 hover:text-white transition-colors">Cookies</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm text-neutral-400">© {year} SHADOMA Votes · {isEn ? "Trusted voting platform" : "Plateforme de vote de confiance"}</span>
          <div className="flex items-center gap-3" aria-label={isEn ? "Social links" : "Réseaux sociaux"}>
            <a href="https://twitter.com" target="_blank" rel="noreferrer noopener" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors" aria-label="Twitter / X">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2H21.5l-7.5 8.57L23 22h-7.06l-5.51-7.2L4.05 22H.79l8.04-9.18L1 2h7.22l4.97 6.59L18.244 2zm-1.24 18h1.86L7.07 4H5.1l11.904 16z" />
              </svg>
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer noopener" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors" aria-label="LinkedIn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14zM8.34 18V9.97H5.67V18h2.67zM7 8.84a1.55 1.55 0 100-3.09 1.55 1.55 0 000 3.09zM18.34 18v-4.4c0-2.36-1.27-3.46-2.97-3.46-1.37 0-1.98.75-2.32 1.27V9.97h-2.67c.04.78 0 8.03 0 8.03h2.67v-4.49c0-.24.02-.47.09-.64.18-.48.62-.97 1.34-.97.95 0 1.33.72 1.33 1.78V18h2.53z" />
              </svg>
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer noopener" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors" aria-label="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7 0 .7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.35.95.1-.74.4-1.24.73-1.53-2.55-.29-5.23-1.27-5.23-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17.91-.25 1.89-.38 2.87-.38s1.96.13 2.87.38c2.19-1.48 3.15-1.17 3.15-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.39-2.69 5.36-5.25 5.65.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
