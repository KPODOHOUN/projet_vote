"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { getStoredToken } from "../../../../lib/auth";
import { useI18n } from "../../../../lib/i18n-provider";
import { Button, Input, Card } from "@/components/ui";
import { DashboardBreadcrumb } from "@/components/dashboard-breadcrumb";
import { clearFormDraft, createDebouncedDraftSaver, loadFormDraft } from "../../../../lib/form-draft";
import { defaultContestWindow } from "../../../../lib/contest-defaults";
import { slugifyTitle } from "../../../../lib/slugify";
import { showToast } from "../../../../lib/toast";
import { trackEvent } from "../../../../lib/analytics";

type LayoutId = "GRID" | "LIST" | "SPOTLIGHT";

type CreateEventResponse = { id: string; slug: string };

type EventDraft = {
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  layout: LayoutId;
  tagline: string;
  logoUrl: string;
  brandColor: string;
};

const DRAFT_KEY = "event-new";

const LAYOUTS: ReadonlyArray<{ id: LayoutId; fr: string; en: string; descFr: string; descEn: string }> = [
  { id: "GRID", fr: "Grille", en: "Grid", descFr: "Cartes photo en grille, idéal pour beaucoup de candidats.", descEn: "Photo cards in a grid, great for many candidates." },
  { id: "LIST", fr: "Liste", en: "List", descFr: "Lignes compactes photo + nom + votes.", descEn: "Compact rows: photo + name + votes." },
  { id: "SPOTLIGHT", fr: "Vedette", en: "Spotlight", descFr: "Un candidat mis en avant puis une grille.", descEn: "One featured candidate, then a grid." }
];

function LayoutPreview({ id }: { id: LayoutId }) {
  const bar = "rounded-sm bg-current";
  if (id === "LIST") {
    return (
      <div className="flex flex-col gap-1.5 w-full text-muted-foreground/50">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`h-4 w-4 ${bar}`} />
            <div className={`h-2 flex-1 ${bar} opacity-60`} />
          </div>
        ))}
      </div>
    );
  }
  if (id === "SPOTLIGHT") {
    return (
      <div className="flex flex-col gap-1.5 w-full text-muted-foreground/50">
        <div className={`h-7 w-full ${bar}`} />
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-4 ${bar} opacity-60`} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1.5 w-full text-muted-foreground/50">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`h-5 ${bar}`} />
      ))}
    </div>
  );
}

export default function NewEventPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const defaultWindow = defaultContestWindow();
  const [startsAt, setStartsAt] = useState(defaultWindow.startsAtIso);
  const [endsAt, setEndsAt] = useState(defaultWindow.endsAtIso);
  const [layout, setLayout] = useState<LayoutId>("GRID");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<EventDraft | null>(null);
  const saveDraft = useRef(createDebouncedDraftSaver<EventDraft>(DRAFT_KEY));

  const trimmedColor = brandColor.trim();
  const colorIsValid = trimmedColor === "" || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmedColor);

  useEffect(() => {
    const existing = loadFormDraft<EventDraft>(DRAFT_KEY);
    if (existing?.title || existing?.startsAt) {
      setDraftPrompt(existing);
    }
  }, []);

  useEffect(() => {
    saveDraft.current({
      title,
      slug,
      startsAt,
      endsAt,
      layout,
      tagline,
      logoUrl,
      brandColor
    });
  }, [title, slug, startsAt, endsAt, layout, tagline, logoUrl, brandColor]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    setSlug(slugifyTitle(value));
  };

  const restoreDraft = () => {
    if (!draftPrompt) return;
    setTitle(draftPrompt.title);
    setSlug(draftPrompt.slug);
    setStartsAt(draftPrompt.startsAt);
    setEndsAt(draftPrompt.endsAt);
    setLayout(draftPrompt.layout);
    setTagline(draftPrompt.tagline);
    setLogoUrl(draftPrompt.logoUrl);
    setBrandColor(draftPrompt.brandColor);
    setDraftPrompt(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    if (!colorIsValid) {
      setError(isEn ? "Brand color must be a hex value (#RGB or #RRGGBB)." : "La couleur doit être un hex (#RGB ou #RRGGBB).");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      const finalSlug = slugifyTitle(title) || slug;
      const trimmedLogo = logoUrl.trim();
      const trimmedTagline = tagline.trim();
      const created = await apiFetch<CreateEventResponse>("/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          slug: finalSlug,
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          layout,
          ...(trimmedTagline ? { tagline: trimmedTagline } : {}),
          ...(trimmedLogo ? { logoUrl: trimmedLogo } : {}),
          ...(trimmedColor ? { brandColor: trimmedColor } : {})
        })
      });
      clearFormDraft(DRAFT_KEY);
      showToast.success(isEn ? "Event created." : "Évènement créé.");
      void trackEvent("event_created", { eventId: created.id, slug: created.slug });
      router.push(`/dashboard/events/${created.id}/candidates?welcome=1`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Creation failed." : "Création impossible.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <DashboardBreadcrumb
        isEn={isEn}
        items={[
          { label: isEn ? "Events" : "Évènements", href: "/dashboard/events" },
          { label: isEn ? "New event" : "Nouvel évènement" }
        ]}
      />

      <header className="flex flex-col gap-2">
        <span className="text-sm font-bold uppercase tracking-widest text-primary">{isEn ? "New event" : "Nouvel évènement"}</span>
        <h2 className="text-4xl font-extrabold tracking-tight text-foreground">{isEn ? "Create an event" : "Créer un évènement"}</h2>
        <p className="max-w-2xl text-lg text-muted-foreground">
          {isEn
            ? "Name your event and set the dates. We'll create your public voting page automatically."
            : "Donnez un nom à votre évènement et choisissez les dates. Votre page de vote sera créée automatiquement."}
        </p>
      </header>

      {draftPrompt ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="text-sm text-foreground">
            {isEn ? "You have an unsaved draft. Resume it?" : "Vous avez un brouillon non enregistré. Le reprendre ?"}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDraftPrompt(null)}>
              {isEn ? "Ignore" : "Ignorer"}
            </Button>
            <Button type="button" size="sm" onClick={restoreDraft}>
              {isEn ? "Resume draft" : "Reprendre"}
            </Button>
          </div>
        </div>
      ) : null}

      <Card className="border border-border/50 bg-card/50 p-8 shadow-sm backdrop-blur-sm">
        <form className="space-y-8" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <Input
                id="title"
                label={isEn ? "Event name" : "Nom de l'évènement"}
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                required
                placeholder={isEn ? "e.g., Best Artist 2026" : "ex : Meilleur Artiste 2026"}
              />
            </div>
            {slug ? (
              <p className="text-sm text-muted-foreground md:col-span-2">
                {isEn
                  ? "A shareable voting link will be created automatically."
                  : "Un lien de vote partageable sera créé automatiquement."}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground md:col-span-2">
              {isEn
                ? "Dates default to the next 30 days. Adjust them later in vote settings."
                : "Les dates couvrent les 30 prochains jours, modifiables plus tard dans les réglages de l'évènement."}
            </p>
          </div>

          <details className="rounded-xl border border-border/50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              {isEn ? "Customize later (optional)" : "Personnaliser plus tard (optionnel)"}
            </summary>
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" role="radiogroup" aria-label={isEn ? "Page layout" : "Disposition de la page"}>
                {LAYOUTS.map((opt) => {
                  const selected = layout === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLayout(opt.id)}
                      className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className={`flex h-16 items-center justify-center rounded-lg p-3 ${selected ? "bg-background" : "bg-muted/50"}`}>
                        <LayoutPreview id={opt.id} />
                      </span>
                      <span className="font-semibold text-foreground">{isEn ? opt.en : opt.fr}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Input id="tagline" label={isEn ? "Tagline (optional)" : "Slogan (optionnel)"} value={tagline} onChange={(e) => setTagline(e.target.value)} />
                <Input id="logoUrl" label={isEn ? "Logo URL (optional)" : "URL du logo (optionnel)"} type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
              </div>
              <Input
                id="brandColor"
                label={isEn ? "Brand color (optional)" : "Couleur de marque (optionnel)"}
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#DB2777"
                state={colorIsValid ? "default" : "error"}
              />
            </div>
          </details>

          <div className="flex items-center justify-end gap-4 pt-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/dashboard/events")}>
              {isEn ? "Cancel" : "Annuler"}
            </Button>
            <Button type="submit" loading={isSaving} size="lg">
              {isEn ? "Create event" : "Créer l'évènement"}
            </Button>
          </div>
        </form>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 font-medium text-destructive" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
