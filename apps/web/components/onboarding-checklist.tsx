"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { CopyPublicLinkButton } from "./copy-public-link-button";

export type OnboardingEvent = {
  id: string;
  slug: string;
  status: string;
  candidateCount: number;
};

type OnboardingChecklistProps = {
  events: OnboardingEvent[];
  isEn?: boolean;
  linkShared?: boolean;
  /** Numéro Mobile Money de retrait enregistré (où l'organisateur reçoit son argent). */
  payoutConfigured?: boolean;
  onLinkShared?: () => void;
};

export function isOnboardingComplete(events: OnboardingEvent[], linkShared: boolean, payoutConfigured = true): boolean {
  const latest = events[0];
  if (!latest) return false;
  return latest.status === "ACTIVE" && payoutConfigured && linkShared;
}

export function OnboardingChecklist({
  events,
  isEn = false,
  linkShared = false,
  payoutConfigured = false,
  onLinkShared
}: OnboardingChecklistProps) {
  const latest = events[0];
  const [shared, setShared] = useState(() => {
    if (typeof window === "undefined" || !events[0]) return linkShared;
    return window.localStorage.getItem(`vp.onboarding.linkShared.${events[0].id}`) === "true" || linkShared;
  });

  const steps = [
    {
      done: events.length > 0 && (latest?.candidateCount ?? 0) > 0,
      label: isEn ? "Create your event" : "Créer votre événement",
      href: "/dashboard/start"
    },
    {
      done: latest?.status === "ACTIVE",
      label: isEn ? "Sign the contract and go live" : "Signer le contrat et mettre en ligne",
      href: latest ? `/dashboard/events/${latest.id}/contract` : null
    },
    {
      done: payoutConfigured,
      label: isEn ? "Save your Mobile Money withdrawal number" : "Enregistrer votre numéro Mobile Money de retrait",
      href: "/dashboard/wallet"
    },
    {
      done: shared,
      label: isEn ? "Share the voting link" : "Partager le lien de vote",
      href: null as string | null
    }
  ];

  if (isOnboardingComplete(events, shared, payoutConfigured)) {
    return null;
  }

  if (events.length === 0) {
    return null;
  }

  const shareStepIndex = steps.length - 1;

  return (
    <section className="space-y-4 rounded-md border border-border bg-background p-5" aria-labelledby="onboarding-title">
      <div>
        <h2 id="onboarding-title" className="text-lg font-bold text-slate-900">
          {isEn ? `${steps.length} steps to launch` : `${steps.length} étapes pour lancer`}
        </h2>
        <p className="text-sm text-slate-600">
          {isEn
            ? "Sign the contract to go live, then share the link. SHADOMA collects the payments."
            : "Signez le contrat pour mettre en ligne, puis partagez le lien. SHADOMA encaisse les paiements."}
        </p>
      </div>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3">
            {step.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--color-success-text)]" aria-hidden="true" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            {step.href && !step.done ? (
              <Link href={step.href} className="text-sm font-medium text-primary hover:underline">
                {index + 1}. {step.label}
              </Link>
            ) : (
              <span className={`text-sm ${step.done ? "text-muted-foreground line-through" : "font-medium text-foreground"}`}>
                {index + 1}. {step.label}
              </span>
            )}
            {index === shareStepIndex && latest && !shared ? (
              <CopyPublicLinkButton
                eventSlug={latest.slug}
                isEn={isEn}
                size="sm"
                onCopied={() => {
                  setShared(true);
                  if (typeof window !== "undefined" && latest) {
                    window.localStorage.setItem(`vp.onboarding.linkShared.${latest.id}`, "true");
                  }
                  onLinkShared?.();
                }}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
