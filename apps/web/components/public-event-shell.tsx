import type { ReactNode } from "react";
import { buildEventTheme, type EventBranding } from "../lib/brand";
import { PublicEventFooter, PublicEventHeader } from "./public-event-header";

type PublicEventShellProps = {
  children: ReactNode;
  eventTitle: string;
  slug: string;
  branding: EventBranding;
  showResultsLink?: boolean;
  tagline?: string | null;
  /** Lien « Billets », seulement si des types de billets existent. */
  ticketsHref?: string | undefined;
};

export function PublicEventShell({
  children,
  eventTitle,
  slug,
  branding,
  showResultsLink = true,
  tagline,
  ticketsHref
}: PublicEventShellProps) {
  const theme = buildEventTheme(branding.brandColor);

  return (
    <div
      className="flex min-h-screen flex-col bg-muted/30"
      data-event-theme
      style={theme.cssVars}
    >
      <PublicEventHeader
        eventTitle={eventTitle}
        logoUrl={branding.logoUrl}
        tagline={tagline || branding.tagline}
        homeHref={`/e/${slug}`}
        resultsHref={showResultsLink ? `/e/${slug}/results` : undefined}
        ticketsHref={ticketsHref}
      />
      <div id="main-content" className="flex-1">{children}</div>
      <PublicEventFooter />
    </div>
  );
}
