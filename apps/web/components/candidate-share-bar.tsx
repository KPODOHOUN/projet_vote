"use client";

import { useI18n } from "../lib/i18n-provider";
import { CopyCandidateLinkButton } from "./copy-candidate-link-button";

type CandidateShareBarProps = {
  eventSlug: string;
  publicRef: string;
  candidateName: string;
  eventTitle: string;
};

/** Barre de partage du profil, dans le langage de la mini-plateforme (filet, sur-titre). */
export function CandidateShareBar({ eventSlug, publicRef, candidateName, eventTitle }: CandidateShareBarProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 border-t border-[var(--mini-rule)] pt-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--mini-muted)]">{t("share.title")}</p>
      <CopyCandidateLinkButton
        eventSlug={eventSlug}
        publicRef={publicRef}
        candidateName={candidateName}
        eventTitle={eventTitle}
        variant="ghost"
        size="sm"
      />
    </div>
  );
}
