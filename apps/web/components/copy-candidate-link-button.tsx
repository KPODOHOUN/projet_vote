"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui";
import { publicCandidateUrl } from "../lib/site";
import { showToast } from "../lib/toast";
import { trackEvent } from "../lib/analytics";

type CopyCandidateLinkButtonProps = {
  eventSlug: string;
  publicRef: string;
  candidateName?: string;
  isEn?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
};

export function CopyCandidateLinkButton({
  eventSlug,
  publicRef,
  candidateName,
  isEn = false,
  variant = "secondary",
  size = "sm"
}: CopyCandidateLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const url = publicCandidateUrl(eventSlug, publicRef);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast.success(isEn ? "Profile link copied." : "Lien du profil copié.");
      void trackEvent("candidate_link_copied", { eventSlug, publicRef });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast.error(isEn ? "Could not copy the link." : "Impossible de copier le lien.");
    }
  };

  const onShare = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: candidateName ?? (isEn ? "Vote for me" : "Votez pour moi"),
          url
        });
        return;
      } catch {
        /* fallback copy */
      }
    }
    await onCopy();
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant={variant} size={size} onClick={() => void onCopy()}>
        {copied ? (
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {copied ? (isEn ? "Copied" : "Copié") : isEn ? "Copy profile link" : "Copier le lien profil"}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => void onShare()}>
        <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
        {isEn ? "Share" : "Partager"}
      </Button>
    </div>
  );
}
