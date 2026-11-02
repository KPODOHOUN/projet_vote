"use client";

import { useState } from "react";
import { Check, Download, Eye, Link2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ticketPagePath, whatsappShareUrl } from "@/lib/my-tickets";

/**
 * Actions d'un billet : le voir, le télécharger, l'envoyer par WhatsApp à son
 * titulaire, copier son lien. Gros boutons, mêmes partout (achat, page du billet).
 */
export function TicketShareActions({
  ticketId,
  secret,
  holderName,
  eventTitle,
  isEn,
  showView = true
}: {
  ticketId: string;
  secret: string;
  holderName: string | null;
  eventTitle: string;
  isEn: boolean;
  showView?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const actionClass = "h-auto min-h-14 flex-col gap-1 px-1 py-2 text-xs font-semibold";
  const path = ticketPagePath(ticketId, secret);
  const absolute = () => `${window.location.origin}${path}`;
  const imagePath = `/t/${encodeURIComponent(ticketId)}/image?s=${encodeURIComponent(secret)}`;

  return (
    // Cases égales, icône au-dessus du libellé : la rangée reste symétrique de 320 px au bureau.
    <div className={`grid gap-2 ${showView ? "grid-cols-4" : "grid-cols-3"}`}>
      {showView ? (
        <Button asChild variant="secondary" className={actionClass}>
          <a href={path}><Eye className="h-4 w-4" aria-hidden="true" />{isEn ? "View" : "Voir"}</a>
        </Button>
      ) : null}
      <Button asChild variant="secondary" className={actionClass}>
        <a href={imagePath} download={`billet-${ticketId.slice(-8)}.png`}>
          <Download className="h-4 w-4" aria-hidden="true" />{isEn ? "Download" : "Télécharger"}
        </a>
      </Button>
      <Button
        variant="secondary"
        className={actionClass}
        onClick={() => window.open(whatsappShareUrl(absolute(), eventTitle, holderName), "_blank", "noopener,noreferrer")}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp
      </Button>
      <Button
        variant="secondary"
        className={actionClass}
        aria-label={isEn ? "Copy the ticket link" : "Copier le lien du billet"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(absolute());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt(isEn ? "Copy this link" : "Copiez ce lien", absolute());
          }
        }}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
        {copied ? (isEn ? "Copied" : "Copié") : isEn ? "Copy" : "Copier"}
      </Button>
    </div>
  );
}
