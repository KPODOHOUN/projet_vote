"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../../../lib/api";
import { getStoredToken } from "../../../../../lib/auth";
import { useAuth } from "../../../../../lib/auth-context";
import { canManagePaymentSecrets } from "../../../../../lib/roles";
import { useI18n } from "../../../../../lib/i18n-provider";
import { Button, Input, Card, LoadingState } from "@/components/ui";
import { DashboardBreadcrumb } from "../../../../../components/dashboard-breadcrumb";
import { NextStepBanner } from "../../../../../components/next-step-banner";
import { CopyPublicLinkButton } from "../../../../../components/copy-public-link-button";
import { ActivationPaymentPanel } from "../../../../../components/activation-payment-panel";
import { FeexPaySecretPanel } from "../../../../../components/feexpay-secret-panel";
import { publicEventPath } from "../../../../../lib/site";
import { showToast } from "../../../../../lib/toast";
import { getEventPartnerStatus } from "../../../../../lib/partners";
import { trackEvent } from "../../../../../lib/analytics";

type EventDetail = {
  id: string;
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
};

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const { locale } = useI18n();
  const isEn = locale === "en";
  const { role } = useAuth();

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [isPartnerEvent, setIsPartnerEvent] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  /** ISO 8601 → valeur acceptée par <input type="datetime-local"> (heure locale). */
  function toLocalInput(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    // No GET /events/:id endpoint — the list returns full event rows, so we read
    // it and pick our event (tenant-scoped server-side).
    void Promise.all([
      apiFetch<EventDetail[]>("/events", { headers: { Authorization: `Bearer ${token}` } }),
      getEventPartnerStatus(token, eventId).catch(() => null)
    ])
      .then(([events, partnerStatus]) => {
        const found = events.find((e) => e.id === eventId);
        if (!found) {
          setLoadError(isEn ? "Event not found." : "Évènement introuvable.");
          return;
        }
        setSlug(found.slug);
        setStatus(found.status);
        setTitle(found.title);
        setStartsAt(toLocalInput(found.startsAt));
        setEndsAt(toLocalInput(found.endsAt));
        setIsPartnerEvent(partnerStatus?.isPartnerEvent ?? false);
      })
      .catch((caughtError) =>
        setLoadError(caughtError instanceof Error ? caughtError.message : isEn ? "Loading failed." : "Chargement impossible.")
      )
      .finally(() => setIsLoading(false));
  }, [eventId, router, isEn]);

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
      await apiFetch(`/events/${eventId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString()
        })
      });
      showToast.success(isEn ? "Changes saved." : "Modifications enregistrées.");
      router.push(`/dashboard/events/${eventId}/candidates`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Update failed." : "Mise à jour impossible.");
    } finally {
      setIsSaving(false);
    }
  };


  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading event…" : "Chargement de l'évènement…"} />;
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium" role="alert">
        {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <DashboardBreadcrumb
        isEn={isEn}
        items={[
          { label: isEn ? "Events" : "Évènements", href: "/dashboard/events" },
          { label: isEn ? "Edit" : "Modifier" }
        ]}
      />

      {status !== "ACTIVE" ? (
        getStoredToken() ? (
          <ActivationPaymentPanel
            eventId={eventId}
            token={getStoredToken() ?? ""}
            isEn={isEn}
            onActivated={() => {
              setStatus("ACTIVE");
              showToast.success(isEn ? "Event is live!" : "Évènement en ligne !");
              void trackEvent("event_activated", { eventId, slug });
            }}
          />
        ) : (
          <NextStepBanner variant="activate" isEn={isEn} eventId={eventId} />
        )
      ) : null}
      {status === "ACTIVE" && slug ? <NextStepBanner variant="share" isEn={isEn} eventSlug={slug} /> : null}

      {status === "ACTIVE" && getStoredToken() && canManagePaymentSecrets(role) ? (
        <FeexPaySecretPanel
          token={getStoredToken() ?? ""}
          isEn={isEn}
          eventId={eventId}
          isPartnerEvent={isPartnerEvent}
          compact
          hideWhenReady
        />
      ) : null}

      <header className="flex flex-col gap-2">
        <span className="text-sm font-bold uppercase tracking-widest text-primary">{isEn ? "Edit event" : "Modifier l'évènement"}</span>
        <h2 className="text-4xl font-extrabold tracking-tight text-foreground">{title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          {slug ? <CopyPublicLinkButton eventSlug={slug} isEn={isEn} /> : null}
          {slug ? (
            <Link
              href={publicEventPath(slug)}
              className="text-sm font-semibold text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {isEn ? "View public page" : "Voir la page publique"}
            </Link>
          ) : null}
        </div>
      </header>

      <Card className="border border-primary/20 bg-primary/5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {isEn ? "Look & feel" : "Apparence"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isEn
                ? "Logo, colors, tagline and how candidates are displayed."
                : "Logo, couleurs, slogan et affichage des candidats."}
            </p>
          </div>
          <Button asChild>
            <Link href={`/dashboard/events/${eventId}/design`}>
              {isEn ? "Customize" : "Personnaliser"}
            </Link>
          </Button>
        </div>
      </Card>

      <Card className="border border-border/50 bg-card/50 p-8 shadow-sm backdrop-blur-sm">
        <form className="space-y-8" onSubmit={onSubmit}>
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">{isEn ? "General Information" : "Informations Générales"}</h3>
            <Input
              id="title"
              label={isEn ? "Event name" : "Nom de l'évènement"}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>

          <div className="w-full h-px bg-border/50" />

          <div className="space-y-6">
            <h3 className="text-lg font-semibold">{isEn ? "Schedule" : "Planification"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                id="startsAt"
                label={isEn ? "Start Date & Time" : "Date et heure de début"}
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
              <Input
                id="endsAt"
                label={isEn ? "End Date & Time" : "Date et heure de fin"}
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4 pt-6">
            <Button type="button" variant="ghost" onClick={() => router.push(`/dashboard/events/${eventId}/candidates`)}>
              {isEn ? "Cancel" : "Annuler"}
            </Button>
            <Button type="submit" loading={isSaving} size="lg">
              {isEn ? "Save changes" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Card>

      {error ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
