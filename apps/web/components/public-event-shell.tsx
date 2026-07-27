import type { ReactNode } from "react";
import { buildEventTheme, type EventBranding } from "../lib/brand";
import { PublicEventFooter, PublicEventHeader } from "./public-event-header";

type PublicEventShellProps = {
  children: ReactNode;
  isEn?: boolean;
  eventTitle: string;
  slug: string;
  branding: EventBranding;
  showResultsLink?: boolean;
  tagline?: string | null;
};

export function PublicEventShell({
  children,
  isEn = false,
  eventTitle,
  slug,
  branding,
  showResultsLink = true,
  tagline
}: PublicEventShellProps) {
  const theme = buildEventTheme(branding.brandColor);

  return (
    <div
      className="flex min-h-screen flex-col bg-muted/30"
      data-event-theme
      style={theme.cssVars}
    >
      <PublicEventHeader
        isEn={isEn}
        eventTitle={eventTitle}
        logoUrl={branding.logoUrl}
        brandColor={branding.brandColor}
        tagline={tagline || branding.tagline}
        resultsHref={showResultsLink ? `/e/${slug}/results` : undefined}
      />
      <div id="main-content" className="flex-1">{children}</div>
      <PublicEventFooter isEn={isEn} />
    </div>
  );
}
