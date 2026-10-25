import type { CSSProperties, ReactNode } from "react";
import { buildEventTheme, type EventBranding } from "../lib/brand";
import { fontStyleOf, heroImageOf, isNightStyle, pageStyleOf } from "../lib/minisite-style";
import { cloudinaryTransform } from "../lib/og-image-url";
import { PublicEventFooter, PublicEventHeader, type HeaderTone, type MinisitePage } from "./public-event-header";

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
  /**
   * En-tête rendu par la page elle-même, à l'intérieur de son bandeau
   * (page des candidats en style Affiche ou Billet) : la coquille ne le pose pas.
   */
  headerInHero?: boolean;
};

/** Fond de l'en-tête quand il est posé par la coquille (hors bandeau). */
export function headerToneFor(branding: EventBranding): HeaderTone {
  const style = pageStyleOf(branding.pageStyle);
  if (style === "billet" || style === "pop") return "accent";
  // Affiche avec couverture : l'en-tête est posé sur une bande de la photo.
  if (style === "affiche" && heroImageOf(branding)) return "image";
  return "page";
}

/**
 * Coquille commune des mini-plateformes (/e/*), d'après la maquette
 * « 3 · Résultats ». L'organisateur choisit la couleur, le logo, la
 * couverture, le style de page et la police ; la structure reste commune.
 */
export function PublicEventShell({
  children,
  eventTitle,
  slug,
  branding,
  active,
  showResultsLink = true,
  ticketsHref,
  headerInHero = false
}: PublicEventShellProps) {
  const theme = buildEventTheme(branding.brandColor);
  const tone = headerToneFor(branding);
  const pageStyle = pageStyleOf(branding.pageStyle);
  // En style nuit (Soirée, Line-up, Story, Sanctuaire), l'action prend l'accent éclairci (lisible sur le fond nuit) ;
  // posé en ligne car les variables du thème le sont aussi. Le paiement
  // (secure-flow) revient à l'accent foncé via globals.css.
  const style =
    isNightStyle(pageStyle)
      ? ({
          ...theme.cssVars,
          "--color-primary": theme.accentBright,
          "--color-primary-foreground": theme.onBright,
          "--color-ring": theme.accentBright
        } as CSSProperties)
      : theme.cssVars;

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--mini-bg)] text-[var(--mini-ink)]"
      data-event-theme
      data-page-style={pageStyle}
      data-title-font={fontStyleOf(branding.fontStyle)}
      style={style}
    >
      {headerInHero ? null : (
        <div
          className={
            tone === "accent"
              ? `bg-[var(--event-header-bg)] ${pageStyle === "pop" ? "border-b-[3px] border-slate-900" : ""}`
              : tone === "image"
                ? "relative overflow-hidden bg-slate-900 pb-10"
                : undefined
          }
        >
          {tone === "image" && heroImageOf(branding) ? (
            <>
              {/* Bande de la couverture : l'identité de l'événement reste visible sur chaque page. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cloudinaryTransform(heroImageOf(branding)!, "w_1920,h_480,c_fill,g_auto,f_auto,q_auto")}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgb(15_23_42/0.7),rgb(15_23_42/0.55))]" />
            </>
          ) : null}
          <PublicEventHeader
            eventTitle={eventTitle}
            slug={slug}
            logoUrl={branding.logoUrl}
            active={active}
            showResults={showResultsLink}
            ticketsHref={ticketsHref}
            tone={tone}
          />
        </div>
      )}
      <div id="main-content" className="flex-1">{children}</div>
      <PublicEventFooter eventTitle={eventTitle} />
    </div>
  );
}
