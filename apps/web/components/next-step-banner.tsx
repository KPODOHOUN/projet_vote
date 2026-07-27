"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { CopyPublicLinkButton } from "./copy-public-link-button";

export type NextStepVariant = "welcome" | "addCandidates" | "activate" | "share";

type NextStepBannerProps = {
  variant: NextStepVariant;
  isEn?: boolean;
  eventId?: string;
  eventSlug?: string;
};

export function NextStepBanner({ variant, isEn = false, eventId, eventSlug }: NextStepBannerProps) {
  if (variant === "welcome") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4" role="status">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">
            {isEn ? "Event created. Add your candidates" : "Évènement créé. Ajoutez vos candidats"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isEn
              ? "Add at least one candidate to open your event to voters."
              : "Ajoutez au moins un candidat pour ouvrir votre évènement aux votants."}
          </p>
        </div>
      </div>
    );
  }

  if (variant === "addCandidates" && eventId) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
        <div>
          <p className="font-semibold text-foreground">
            {isEn ? "Next: customize and go live" : "Ensuite : personnaliser et mettre en ligne"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isEn ? "Set your look and dates, then launch." : "Choisissez l'apparence et les dates, puis lancez."}
          </p>
        </div>
        <Link
          href={`/dashboard/events/${eventId}/edit`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-md transition-all"
        >
          {isEn ? "Edit event" : "Modifier l'évènement"}
        </Link>
      </div>
    );
  }

  if (variant === "activate" && eventId) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
        <div>
          <p className="font-semibold text-foreground">
            {isEn ? "Next: go live" : "Ensuite : mettre en ligne"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isEn ? "Your event is ready. Launch it when you are." : "Votre évènement est prêt. Lancez-le quand vous voulez."}
          </p>
        </div>
        <Link
          href={`/dashboard/events/${eventId}/edit`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-md transition-all"
        >
          {isEn ? "Go live" : "Mettre en ligne"}
        </Link>
      </div>
    );
  }

  if (variant === "share" && eventSlug) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
        <div>
          <p className="font-semibold text-foreground">
            {isEn ? "Share your voting page" : "Partagez votre page de vote"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isEn
              ? "Copy the link and send it to your voters: WhatsApp, social media, anywhere."
              : "Copiez le lien et envoyez-le à vos votants : WhatsApp, réseaux sociaux, partout."}
          </p>
        </div>
        <CopyPublicLinkButton eventSlug={eventSlug} isEn={isEn} />
      </div>
    );
  }

  return null;
}
