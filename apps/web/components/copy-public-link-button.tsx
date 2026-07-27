"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { publicEventUrl } from "../lib/site";
import { showToast } from "../lib/toast";
import { trackEvent } from "../lib/analytics";

type CopyPublicLinkButtonProps = {
  eventSlug: string;
  isEn?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  onCopied?: () => void;
};

export function CopyPublicLinkButton({
  eventSlug,
  isEn = false,
  variant = "secondary",
  size = "sm",
  onCopied
}: CopyPublicLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const url = publicEventUrl(eventSlug);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast.success(isEn ? "Public link copied." : "Lien public copié.");
      void trackEvent("public_link_copied", { eventSlug });
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast.error(isEn ? "Could not copy the link." : "Impossible de copier le lien.");
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={() => void onCopy()}>
      {copied ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
      {copied ? (isEn ? "Copied" : "Copié") : isEn ? "Copy public link" : "Copier le lien public"}
    </Button>
  );
}
