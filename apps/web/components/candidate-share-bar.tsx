"use client";

import { CopyCandidateLinkButton } from "./copy-candidate-link-button";

type CandidateShareBarProps = {
  eventSlug: string;
  publicRef: string;
  candidateName: string;
  eventTitle: string;
};

/** Partage du profil, sous le formulaire de vote : un bouton qui ouvre le panneau de partage. */
export function CandidateShareBar({ eventSlug, publicRef, candidateName, eventTitle }: CandidateShareBarProps) {
  return (
    <div className="border-t border-[var(--mini-rule)] pt-5">
      <CopyCandidateLinkButton
        eventSlug={eventSlug}
        publicRef={publicRef}
        candidateName={candidateName}
        eventTitle={eventTitle}
        variant="ghost"
      />
    </div>
  );
}
