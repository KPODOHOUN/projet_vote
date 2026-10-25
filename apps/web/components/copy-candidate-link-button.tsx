"use client";

import { ShareSheet } from "./share-sheet";
import { publicCandidateUrl } from "../lib/site";
import { useI18n } from "../lib/i18n-provider";

type CopyCandidateLinkButtonProps = {
  eventSlug: string;
  publicRef: string;
  candidateName?: string;
  /** Titre du concours, pour le message partagé. */
  eventTitle?: string;
  /** Conservé pour les appels existants ; la langue vient du contexte i18n. */
  isEn?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
};

/**
 * Partage d'un profil candidat : ouvre le panneau de partage (copie du lien,
 * réseaux avec leurs logos officiels, partage natif). Aucun SDK tiers.
 */
export function CopyCandidateLinkButton({ eventSlug, publicRef, candidateName, eventTitle, variant = "secondary" }: CopyCandidateLinkButtonProps) {
  const { t } = useI18n();
  const url = publicCandidateUrl(eventSlug, publicRef);
  const title = [candidateName, eventTitle].filter(Boolean).join(" · ") || url;
  return (
    <ShareSheet
      url={url}
      title={title}
      text={t("share.voterText", { name: candidateName ?? "", event: eventTitle ?? "", url })}
      label={t("share.profileButton")}
      appearance={variant === "primary" ? "solid" : "outline"}
      analyticsEvent="candidate_link_copied"
      analyticsMeta={{ eventSlug, publicRef }}
    />
  );
}
