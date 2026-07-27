"use client";

import { CopyCandidateLinkButton } from "./copy-candidate-link-button";

type CandidateShareBarProps = {
  eventSlug: string;
  publicRef: string;
  candidateName: string;
  isEn?: boolean;
};

export function CandidateShareBar({ eventSlug, publicRef, candidateName, isEn = false }: CandidateShareBarProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2">
      <p className="text-sm font-medium text-foreground">
        {isEn ? "Share this profile" : "Partager ce profil"}
      </p>
      <p className="text-xs text-muted-foreground">
        {isEn
          ? "Send this link so voters land directly on this candidate's page."
          : "Envoyez ce lien pour que les votants arrivent directement sur la page de ce candidat."}
      </p>
      <CopyCandidateLinkButton
        eventSlug={eventSlug}
        publicRef={publicRef}
        candidateName={candidateName}
        isEn={isEn}
        variant="secondary"
        size="sm"
      />
    </div>
  );
}
