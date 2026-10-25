import type { ReactNode } from "react";
import { buildEventTheme, type EventBranding } from "../lib/brand";
import { PublicEventFooter, PublicEventHeader, type MinisitePage } from "./public-event-header";

type PublicEventShellProps = {
  children: ReactNode;
  eventTitle: string;
  slug: string;
  branding: EventBranding;
  /** Onglet actif de la mini-plateforme. */
  active?: MinisitePage;
  showResultsLink?: boolean;
  /** Lien « Billets », seulement si des types de billets existent. */
  ticketsHref?: string | undefined;
};

/**
 * Coquille commune des mini-plateformes (/e/*), d'après la maquette
 * « 3 · Résultats » : fond blanc, encre, filets, accent de l'événement.
 * Seuls le titre, le logo et la couleur changent d'un événement à l'autre.
 */
export function PublicEventShell({
  children,
  eventTitle,
  slug,
  branding,
  active,
  showResultsLink = true,
  ticketsHref
}: PublicEventShellProps) {
  const theme = buildEventTheme(branding.brandColor);

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-slate-900"
      data-event-theme
      style={theme.cssVars}
    >
      <PublicEventHeader
        eventTitle={eventTitle}
        slug={slug}
        logoUrl={branding.logoUrl}
        active={active}
        showResults={showResultsLink}
        ticketsHref={ticketsHref}
      />
      <div id="main-content" className="flex-1">{children}</div>
      <PublicEventFooter eventTitle={eventTitle} />
    </div>
  );
}
