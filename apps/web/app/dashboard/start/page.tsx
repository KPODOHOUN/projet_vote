"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, Input, Card } from "@/components/ui";
import { PhotoUploadField } from "../../../components/photo-upload-field";
import { CopyPublicLinkButton } from "../../../components/copy-public-link-button";
import { ActivationPaymentPanel } from "../../../components/activation-payment-panel";
import { FeexPaySecretPanel } from "../../../components/feexpay-secret-panel";
import { publicEventPath } from "../../../lib/site";
import { showToast } from "../../../lib/toast";
import { getEventPartnerStatus } from "../../../lib/partners";
import { trackEvent } from "../../../lib/analytics";

type QuickStartResponse = {
  event: { id: string; slug: string; title: string; status: string };
  candidate: { id: string; fullName: string };
  activated: boolean;
  slug: string;
};

export default function QuickStartPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [title, setTitle] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<QuickStartResponse | null>(null);
  const [isPartnerEvent, setIsPartnerEvent] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (!token || !result?.event.id) return;
    void getEventPartnerStatus(token, result.event.id).then((status) => {
      setIsPartnerEvent(status.isPartnerEvent);
    });
  }, [result?.event.id]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      const trimmedPhoto = photoUrl.trim();
      const response = await apiFetch<QuickStartResponse>("/events/quick-start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          candidateFullName: candidateName.trim(),
          ...(trimmedPhoto ? { candidatePhotoUrl: trimmedPhoto } : {})
        })
      });
      setResult(response);
      showToast.success(
        response.activated
          ? isEn
            ? "Your event is live!"
            : "Votre évènement est en ligne !"
          : isEn
            ? "Event created. One step left to open voting."
            : "Évènement créé. Une étape pour ouvrir les votes."
      );
      void trackEvent("quick_start_completed", { eventId: response.event.id, activated: response.activated });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Launch failed." : "Lancement impossible.");
    } finally {
      setIsSaving(false);
    }
  };

  if (result) {
    const token = getStoredToken() ?? "";
    const isLive = result.activated || result.event.status === "ACTIVE";

    return (
      <div className="mx-auto max-w-2xl space-y-6 py-4">
        <Card className={`space-y-6 p-8 ${isLive ? "border border-emerald-500/20 bg-emerald-500/5" : "border border-border bg-card"}`}>
          <div className="flex items-start gap-4">
            <PartyPopper className={`mt-1 h-8 w-8 shrink-0 ${isLive ? "text-emerald-600" : "text-primary"}`} aria-hidden="true" />
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
                {isLive
                  ? isEn
                    ? "Your voting platform is live!"
                    : "Votre page de vote est en ligne !"
                  : isEn
                    ? "Almost there!"
                    : "Presque fini !"}
              </h2>
              <p className="text-muted-foreground">
                {isLive
                  ? isEn
                    ? "Customize your look, then share the link with your voters."
                    : "Personnalisez l'apparence, puis partagez le lien à vos votants."
                  : isEn
                    ? "One payment on your phone to go live, then customize and share."
                    : "Un paiement sur votre téléphone pour lancer, puis personnalisez et partagez."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={`/dashboard/events/${result.event.id}/design`}>
                {isEn ? "Customize look & feel" : "Personnaliser la page"}
              </Link>
            </Button>
            {isLive ? <CopyPublicLinkButton eventSlug={result.slug} isEn={isEn} size="default" /> : null}
            <Button asChild variant="secondary">
              <Link href={publicEventPath(result.slug)} target="_blank" rel="noopener noreferrer">
                {isEn ? "Preview page" : "Voir la page"}
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/dashboard/events/${result.event.id}/candidates`}>
                {isEn ? "Add more candidates" : "Ajouter d'autres candidats"}
              </Link>
            </Button>
          </div>
        </Card>

        {!isLive && token ? (
          <ActivationPaymentPanel
            eventId={result.event.id}
            token={token}
            isEn={isEn}
            onActivated={() =>
              setResult((prev) =>
                prev
                  ? {
                      ...prev,
                      activated: true,
                      event: { ...prev.event, status: "ACTIVE" }
                    }
                  : prev
              )
            }
          />
        ) : null}

        {(isLive || result.event.status === "ACTIVE") && token ? (
          <FeexPaySecretPanel
            token={token}
            isEn={isEn}
            eventId={result.event.id}
            isPartnerEvent={isPartnerEvent}
            hideWhenReady
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 py-4">
      <header className="space-y-2 text-center sm:text-left">
        <span className="text-sm font-bold uppercase tracking-widest text-primary">
          {isEn ? "Quick launch" : "Lancement rapide"}
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
          {isEn ? "Launch your event in one step" : "Lancez votre évènement en une étape"}
        </h2>
        <p className="text-muted-foreground">
          {isEn
            ? "Two names and you're live. Dates and appearance can be adjusted later."
            : "Deux noms suffisent pour être en ligne. Dates et apparence se règlent plus tard."}
        </p>
      </header>

      <Card className="border border-border/50 p-8 shadow-sm">
        <form className="space-y-6" onSubmit={onSubmit}>
          <Input
            id="title"
            label={isEn ? "Event name" : "Nom de l'évènement"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isEn ? "e.g. Miss Campus 2026" : "ex. Miss Campus 2026"}
            required
            autoFocus
          />
          <Input
            id="candidateName"
            label={isEn ? "First candidate" : "Premier candidat"}
            helpText={
              isEn
                ? "You can add more candidates right after launching."
                : "Vous pourrez ajouter d'autres candidats juste après."
            }
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder={isEn ? "e.g. Arielle K." : "ex. Arielle K."}
            required
          />
          <PhotoUploadField
            value={photoUrl}
            onChange={setPhotoUrl}
            token={getStoredToken() ?? ""}
            label={isEn ? "Photo (optional)" : "Photo (optionnelle)"}
            fullName={candidateName}
          />

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
              {error}
            </div>
          ) : null}

          <Button type="submit" loading={isSaving} size="lg" className="w-full">
            {isEn ? "Launch my event" : "Lancer mon évènement"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
