"use client";

import { ShareSheet } from "./share-sheet";
import { publicEventUrl } from "../lib/site";
import { useI18n } from "../lib/i18n-provider";

type CopyPublicLinkButtonProps = {
  eventSlug: string;
  /** Titre du concours, pour le message partagé. */
  eventTitle?: string;
  /** Conservé pour les appels existants ; la langue vient du contexte i18n. */
  isEn?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  onCopied?: () => void;
};

/**
 * Partage de la page publique d'un concours (organisateur) : ouvre le panneau
 * de partage (copie du lien, réseaux, partage natif). Nom conservé pour les
 * imports existants.
 */
export function CopyPublicLinkButton({ eventSlug, eventTitle, variant = "secondary", onCopied }: CopyPublicLinkButtonProps) {
  const { t } = useI18n();
  const url = publicEventUrl(eventSlug);
  const title = eventTitle ?? url;
  return (
    <ShareSheet
      url={url}
      title={title}
      text={eventTitle ? t("share.eventText", { event: eventTitle, url }) : url}
      label={t("share.publicButton")}
      appearance={variant === "primary" ? "solid" : "outline"}
      onShared={onCopied}
      analyticsEvent="public_link_copied"
      analyticsMeta={{ eventSlug }}
    />
  );
}
