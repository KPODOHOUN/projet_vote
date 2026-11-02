"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, Input, Card } from "@/components/ui";
import { PhotoUploadField } from "../../../components/photo-upload-field";
import { PublishPanel } from "../../../components/publish-panel";
import { publicEventPath } from "../../../lib/site";
import { showToast } from "../../../lib/toast";
import { trackEvent } from "../../../lib/analytics";

type QuickStartResponse = {
  event: { id: string; slug: string; title: string; status: string };
  candidate: { id: string; fullName: string };
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
      showToast.success(isEn ? "Contest created as a draft." : "Concours créé en brouillon.");
      void trackEvent("quick_start_completed", { eventId: response.event.id });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Launch failed." : "Lancement impossible.");
    } finally {
      setIsSaving(false);
    }
  };

  if (result) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-4">
        <Card className="space-y-6 border border-border bg-card p-8">
          <div className="flex items-start gap-4">
            <PartyPopper className="mt-1 h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
                {isEn ? "Your contest is created" : "Votre concours est créé"}
              </h2>
              <p className="text-muted-foreground">
                {isEn
                  ? "It is a draft for now. Set the vote price, customize the page, then read and sign the contract to put it online."
                  : "Il est en brouillon. Fixez le prix du vote, personnalisez la page, puis lisez et signez le contrat pour le mettre en ligne."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={`/dashboard/events/${result.event.id}/edit`}>{isEn ? "Set the vote price" : "Fixer le prix du vote"}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/dashboard/events/${result.event.id}/design`}>{isEn ? "Customize the page" : "Personnaliser la page"}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/dashboard/events/${result.event.id}/candidates`}>{isEn ? "Add more candidates" : "Ajouter d'autres candidats"}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={publicEventPath(result.slug)} target="_blank" rel="noopener noreferrer">{isEn ? "Preview page" : "Voir la page"}</Link>
            </Button>
          </div>
        </Card>
        <PublishPanel eventId={result.event.id} eventStatus={result.event.status} isEn={isEn} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 py-4">
      <header className="space-y-2 text-center sm:text-left">
        <span className="text-sm font-semibold text-slate-600">
          {isEn ? "Quick launch" : "Lancement rapide"}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl text-foreground">
          {isEn ? "Launch your event in one step" : "Lancez votre événement en une étape"}
        </h1>
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
            label={isEn ? "Event name" : "Nom de l'événement"}
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
            {isEn ? "Launch my event" : "Lancer mon événement"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
