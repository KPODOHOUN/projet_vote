"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui";
import { publicCandidateUrl } from "../lib/site";
import { showToast } from "../lib/toast";
import { trackEvent } from "../lib/analytics";
import { useI18n } from "../lib/i18n-provider";

type CopyCandidateLinkButtonProps = {
  eventSlug: string;
  publicRef: string;
  candidateName?: string;
  /** Titre du concours, pour le texte WhatsApp. */
  eventTitle?: string;
  /** Conservé pour les appels existants ; la langue vient du contexte i18n. */
  isEn?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
};

/**
 * Partage d'un profil (7.11-g) : copier le lien, WhatsApp (lien wa.me simple),
 * et partage natif quand le navigateur le propose. Aucun SDK tiers.
 */
export function CopyCandidateLinkButton({
  eventSlug,
  publicRef,
  candidateName,
  eventTitle,
  variant = "secondary",
  size = "sm"
}: CopyCandidateLinkButtonProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  // navigator.share n'existe qu'au client : détecté après montage (pas d'écart d'hydratation).
  const [canShare, setCanShare] = useState(false);
  const url = publicCandidateUrl(eventSlug, publicRef);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const shareText = t("share.voterText", { name: candidateName ?? "", event: eventTitle ?? "", url });
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast.success(t("share.copied"));
      void trackEvent("candidate_link_copied", { eventSlug, publicRef });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast.error(t("share.copyFailed"));
    }
  };

  const onShare = async () => {
    try {
      await navigator.share({ title: candidateName ?? eventTitle ?? "", text: shareText, url });
    } catch {
      /* partage annulé : rien à faire */
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant={variant} size={size} className="min-h-11" onClick={() => void onCopy()}>
        {copied ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
        {copied ? t("share.copied") : t("share.copy")}
      </Button>
      {eventTitle ? (
        <Button asChild variant="ghost" size={size} className="min-h-11">
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
            {t("share.whatsapp")}
          </a>
        </Button>
      ) : null}
      {canShare ? (
        <Button type="button" variant="ghost" size={size} className="min-h-11" onClick={() => void onShare()}>
          <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("share.native")}
        </Button>
      ) : null}
    </div>
  );
}
