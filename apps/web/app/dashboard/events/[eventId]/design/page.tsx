"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import { apiFetch } from "../../../../../lib/api";
import { getStoredToken } from "../../../../../lib/auth";
import { useI18n } from "../../../../../lib/i18n-provider";
import {
  buildEventTheme,
  normalizeBrandColor,
  extractColorFromImage,
  getBrandPresetsByVibe
} from "../../../../../lib/brand";
import { EVENT_LAYOUTS, type EventLayoutId } from "../../../../../lib/event-layouts";
import { publicEventPath } from "../../../../../lib/site";
import { DashboardBreadcrumb } from "../../../../../components/dashboard-breadcrumb";
import { LogoUploadField } from "../../../../../components/logo-upload-field";
import { CopyPublicLinkButton } from "../../../../../components/copy-public-link-button";
import { ActivationPaymentPanel } from "../../../../../components/activation-payment-panel";
import { showToast } from "../../../../../lib/toast";
import { Button, Input, Card, LoadingState } from "@/components/ui";

type EventDetail = {
  id: string;
  slug: string;
  title: string;
  status: string;
  tagline: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  layout: EventLayoutId;
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const VIBE_LABELS: Record<string, { fr: string; en: string }> = {
  luxe: { fr: "Luxe & Prestige", en: "Luxury & Prestige" },
  nature: { fr: "Nature & Écologie", en: "Nature & Ecology" },
  festif: { fr: "Festif & Dynamique", en: "Festive & Dynamic" },
  pro: { fr: "Professionnel", en: "Professional" },
  culture: { fr: "Culture & Tradition", en: "Culture & Tradition" },
  sport: { fr: "Sport & Performance", en: "Sport & Performance" },
};

export default function EventDesignPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#6366F1");
  const [layout, setLayout] = useState<EventLayoutId>("GRID");
  const [previewKey, setPreviewKey] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const trimmedColor = brandColor.trim();
  const colorIsValid = trimmedColor === "" || HEX.test(trimmedColor);
  const theme = useMemo(() => buildEventTheme(colorIsValid ? trimmedColor : null), [colorIsValid, trimmedColor]);
  const colorSwatch = normalizeBrandColor(trimmedColor) ?? "#6366F1";
  const presetsByVibe = useMemo(() => getBrandPresetsByVibe(), []);

  const loadEvent = useCallback(async (token: string) => {
    const events = await apiFetch<EventDetail[]>("/events", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const found = events.find((item) => item.id === eventId);
    if (!found) {
      throw new Error(isEn ? "Event not found." : "Évènement introuvable.");
    }
    setTitle(found.title);
    setSlug(found.slug);
    setStatus(found.status);
    setTagline(found.tagline ?? "");
    setLogoUrl(found.logoUrl ?? "");
    setBrandColor(found.brandColor ?? "#6366F1");
    setLayout(found.layout ?? "GRID");
  }, [eventId, isEn]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    void loadEvent(token)
      .catch((caughtError) =>
        setLoadError(caughtError instanceof Error ? caughtError.message : isEn ? "Loading failed." : "Chargement impossible.")
      )
      .finally(() => setIsLoading(false));
  }, [loadEvent, router, isEn]);

  const handleExtractColor = async () => {
    if (!logoUrl) return;
    setIsExtracting(true);
    try {
      const color = await extractColorFromImage(logoUrl);
      if (color) {
        setBrandColor(color);
        showToast.success(isEn ? "Color extracted from logo." : "Couleur extraite du logo.");
      } else {
        showToast.error(isEn ? "Could not extract color." : "Impossible d'extraire la couleur.");
      }
    } catch {
      showToast.error(isEn ? "Extraction failed." : "Échec de l'extraction.");
    } finally {
      setIsExtracting(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    if (!colorIsValid) {
      setError(isEn ? "Invalid color format." : "Format de couleur invalide.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      const trimmedTagline = tagline.trim();
      const trimmedLogo = logoUrl.trim();
      const normalized = normalizeBrandColor(trimmedColor);
      await apiFetch(`/events/${eventId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          layout,
          ...(trimmedTagline ? { tagline: trimmedTagline } : {}),
          ...(trimmedLogo ? { logoUrl: trimmedLogo } : {}),
          ...(normalized ? { brandColor: normalized } : {})
        })
      });
      showToast.success(isEn ? "Appearance saved." : "Apparence enregistrée.");
      setPreviewKey((k) => k + 1);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Save failed." : "Enregistrement impossible.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading…" : "Chargement…"} />;
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 font-medium text-destructive" role="alert">
        {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <DashboardBreadcrumb
        isEn={isEn}
        items={[
          { label: isEn ? "Events" : "Évènements", href: "/dashboard/events" },
          { label: title, href: `/dashboard/events/${eventId}/candidates` },
          { label: isEn ? "Customize page" : "Personnaliser la page" }
        ]}
      />

      <header className="flex flex-col gap-4 border-b border-border/50 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <span className="text-sm font-bold uppercase tracking-widest text-primary">
            {isEn ? "Public voting page" : "Page publique de vote"}
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{title}</h2>
          <p className="max-w-xl text-muted-foreground">
            {isEn
              ? "Logo, colors and layout. Voters get a dedicated page at your share link."
              : "Logo, couleurs et disposition. Vos votants accèdent à une page dédiée via votre lien de partage."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyPublicLinkButton eventSlug={slug} isEn={isEn} />
          <Button asChild variant="secondary">
            <Link href={publicEventPath(slug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              {isEn ? "Open live page" : "Ouvrir la page live"}
            </Link>
          </Button>
        </div>
      </header>

      {status !== "" && status !== "ACTIVE" && getStoredToken() ? (
        <ActivationPaymentPanel
          eventId={eventId}
          token={getStoredToken() ?? ""}
          isEn={isEn}
          title={isEn ? "Publish this event" : "Publier cet évènement"}
          description={
            isEn
              ? "Your page is ready — activate it so voters can access it."
              : "Votre page est prête — activez-la pour la rendre accessible aux votants."
          }
          onActivated={() => setStatus("ACTIVE")}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <Card className="space-y-8 border border-border/50 p-6 shadow-sm lg:p-8">
          <form className="space-y-8" onSubmit={onSubmit}>
            <LogoUploadField
              value={logoUrl}
              onChange={setLogoUrl}
              token={getStoredToken() ?? ""}
              label={isEn ? "Event logo" : "Logo de l'évènement"}
            />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {isEn ? "Header & accent color" : "Couleur d'en-tête et accents"}
                </span>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleExtractColor}
                    disabled={isExtracting}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-primary transition-all hover:bg-primary/10"
                  >
                    {isExtracting ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    {isEn ? "Extract from logo" : "Depuis le logo"}
                  </button>
                )}
              </div>

              {/* Presets by vibe */}
              <div className="space-y-4">
                {Object.entries(presetsByVibe).map(([vibe, presets]) => {
                  const labels = VIBE_LABELS[vibe] || { fr: vibe, en: vibe };
                  return (
                    <div key={vibe}>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {isEn ? labels.en : labels.fr}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {presets.map((preset) => {
                          const selected = colorSwatch === preset.color;
                          return (
                            <button
                              key={preset.color}
                              type="button"
                              aria-label={preset.label}
                              title={preset.label}
                              aria-pressed={selected}
                              onClick={() => setBrandColor(preset.color)}
                              className={`group relative h-8 w-8 rounded-full border-2 transition-all hover:scale-110 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                selected
                                  ? "border-foreground ring-2 ring-primary/30 scale-110"
                                  : "border-transparent"
                              }`}
                              style={{ backgroundColor: preset.color }}
                            >
                              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                {preset.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="color"
                  aria-label={isEn ? "Pick color" : "Choisir une couleur"}
                  value={colorSwatch}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-background p-1"
                />
                <Input
                  id="brandColor"
                  label=""
                  aria-label={isEn ? "Hex color" : "Couleur hex"}
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  placeholder="#6366F1"
                  state={colorIsValid ? "default" : "error"}
                  className="max-w-[160px]"
                />
              </div>

              <motion.div
                layout
                className="overflow-hidden rounded-xl"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentAlt} 100%)`
                }}
              >
                <div className="flex items-center gap-3 px-5 py-4" style={{ color: theme.headerFg }}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-black"
                    style={{ background: `${theme.headerFg}15`, border: `1px solid ${theme.headerFg}20` }}>
                    {title.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{title}</p>
                    {tagline && <p className="text-[11px] opacity-75">{tagline}</p>}
                  </div>
                </div>
              </motion.div>
            </div>

            <Input
              id="tagline"
              label={isEn ? "Tagline (optional)" : "Slogan (optionnel)"}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={isEn ? "e.g. Vote for your favorite artist" : "ex. Votez pour votre artiste préféré"}
            />

            <div className="space-y-3">
              <span className="text-sm font-semibold text-foreground">
                {isEn ? "Candidates layout" : "Disposition des candidats"}
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup">
                {EVENT_LAYOUTS.map((opt) => {
                  const selected = layout === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLayout(opt.id)}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        selected ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="block font-semibold text-foreground">{isEn ? opt.en : opt.fr}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{isEn ? opt.descEn : opt.descFr}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={isSaving} size="lg">
                {isEn ? "Save appearance" : "Enregistrer l'apparence"}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link href={`/dashboard/events/${eventId}/candidates`}>
                  {isEn ? "Back to candidates" : "Retour aux candidats"}
                </Link>
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-foreground">{isEn ? "Live preview" : "Aperçu en direct"}</h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewKey((k) => k + 1)}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {isEn ? "Refresh" : "Actualiser"}
            </Button>
          </div>
          <CopyPublicLinkButton eventSlug={slug} isEn={isEn} />
          <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
            <iframe
              key={previewKey}
              title={isEn ? "Event preview" : "Aperçu de l'évènement"}
              src={publicEventPath(slug)}
              className="h-[min(720px,70vh)] w-full bg-muted/30"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
