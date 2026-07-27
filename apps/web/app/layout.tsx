import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
// Styles des primitives partagées (design-system/components). Classes scopées
// sous .vp-ui → aucune collision avec le CSS bespoke .vp-* de globals.css.
import "../../../design-system/components/ui.css";
import { I18nProvider } from "../lib/i18n-provider";
import { QueryProvider } from "../lib/query-provider";
import { AuthModalProvider } from "../components/auth/auth-modal-provider";
import { MaintenanceBanner } from "../components/maintenance-banner";
import { LegalFooter } from "../components/legal-footer";
import { CookieConsentCenter } from "../components/cookie-consent-center";
import { ChatWidget } from "../components/chat-widget";
import { Toaster } from "../components/ui/sonner";
import { SITE_NAME, SITE_URL } from "../lib/site";

// Self-hosted variable fonts (latin subset, covers FR/EN) — TD-002. Removes the
// build-time dependency on Google Fonts; the .woff2 files live in ./fonts and a
// single variable file per family covers every weight via a range.
const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-display",
  display: "swap",
  fallback: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"]
});

const inter = localFont({
  src: "./fonts/inter.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-body",
  display: "swap",
  fallback: ["Inter", "Plus Jakarta Sans", "system-ui", "sans-serif"]
});

const jetbrains = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-mono",
  display: "swap",
  fallback: ["JetBrains Mono", "ui-monospace", "monospace"]
});

// Base canonique partagée avec sitemap.ts / robots.ts. metadataBase permet aux
// pages /e/[slug] de produire des URLs OG absolues à partir de chemins relatifs.
const DEFAULT_TITLE = `${SITE_NAME} · Plateforme de votes`;
const DEFAULT_DESCRIPTION =
  "SHADOMA Votes aide les organisateurs à piloter les votes payants pour leurs évènements : parcours simple, paiements sécurisés et suivi en temps réel.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_TITLE,
    // Les pages qui définissent un titre obtiennent « Titre · SHADOMA Votes ».
    template: `%s · ${SITE_NAME}`
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    locale: "fr_FR"
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION
  }
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // suppressHydrationWarning : des extensions de navigateur (et le sync de
    // `lang` par I18nProvider) modifient l'élément <html> après le rendu serveur ;
    // on neutralise le faux positif d'hydratation sur CET élément uniquement.
    <html
      lang="fr"
      className={`${jakarta.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Aller au contenu principal
        </a>
        <QueryProvider>
          <I18nProvider>
            <Suspense fallback={null}>
              <AuthModalProvider>
                <MaintenanceBanner />
                {children}
              </AuthModalProvider>
            </Suspense>
            <CookieConsentCenter />
            <LegalFooter />
            <ChatWidget />
            <Toaster position="top-center" />
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
