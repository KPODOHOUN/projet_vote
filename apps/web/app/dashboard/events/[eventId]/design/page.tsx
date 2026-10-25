"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, Wand2 } from "lucide-react";
import { apiFetch } from "../../../../../lib/api";
import { getStoredToken } from "../../../../../lib/auth";
import { useI18n } from "../../../../../lib/i18n-provider";
import type { MessageKey } from "../../../../../lib/i18n";
import {
  DEFAULT_BRAND_COLOR,
  buildEventTheme,
  contrastRatio,
  normalizeBrandColor,
  extractColorFromImage,
  getBrandPresetsByVibe,
  type EventFontStyleValue,
  type EventPageStyleValue
} from "../../../../../lib/brand";
import { EVENT_LAYOUTS, type EventLayoutId } from "../../../../../lib/event-layouts";
import { publicEventPath } from "../../../../../lib/site";
import { DashboardBreadcrumb } from "../../../../../components/dashboard-breadcrumb";
import { LogoUploadField } from "../../../../../components/logo-upload-field";
import { ImageUploadField } from "../../../../../components/image-upload-field";
import { CopyPublicLinkButton } from "../../../../../components/copy-public-link-button";
import { ActivationPaymentPanel } from "../../../../../components/activation-payment-panel";
import { showToast } from "../../../../../lib/toast";
import { Button, Input, Card, FormError, LoadingState } from "@/components/ui";

type EventDetail = {
  id: string;
  slug: string;
  title: string;
  status: string;
  tagline: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  layout: EventLayoutId;
  coverUrl?: string | null;
  pageStyle?: EventPageStyleValue;
  fontStyle?: EventFontStyleValue;
};

type Saved = {
  tagline: string;
  logoUrl: string;
  brandColor: string;
  layout: EventLayoutId;
  coverUrl: string;
  pageStyle: EventPageStyleValue;
  fontStyle: EventFontStyleValue;
};

const PAGE_STYLES: EventPageStyleValue[] = ["AFFICHE", "SOIREE", "BILLET"];
const FONT_STYLES: Array<{ id: EventFontStyleValue; family: string; weight: number }> = [
  { id: "FESTIVAL", family: "var(--font-festival)", weight: 300 },
  { id: "GALA", family: "var(--font-gala)", weight: 400 },
  { id: "CLASSIQUE", family: "var(--font-display)", weight: 300 }
];

/** Vignette schématique d'un style de page (formes seulement, aucun contenu inventé). */
function StyleThumb({ style, accent }: { style: EventPageStyleValue; accent: string }) {
  if (style === "SOIREE") {
    return (
      <span aria-hidden="true" className="flex h-20 flex-col justify-between rounded-md bg-[#0e1220] p-2.5">
        <span className="h-1.5 w-12 rounded-sm bg-white/80" />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-5 flex-1 rounded-sm" style={{ background: `color-mix(in srgb, ${accent} 35%, #1a1f33)` }} />
          ))}
        </span>
      </span>
    );
  }
  if (style === "BILLET") {
    return (
      <span aria-hidden="true" className="relative flex h-20 flex-col rounded-md bg-slate-50">
        <span className="h-10 rounded-t-md p-2.5" style={{ background: accent }}>
          <span className="block h-1.5 w-12 rounded-sm bg-white/90" />
        </span>
        <span className="absolute inset-x-2.5 bottom-2 flex h-7 rounded-sm bg-white shadow-sm">
          <span className="flex-1" />
          <span className="w-8 border-l border-dashed border-slate-300" />
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex h-20 flex-col justify-end rounded-md bg-[linear-gradient(180deg,#475569,#0f172a)] p-2.5">
      <span className="h-2 w-16 rounded-sm bg-white" />
      <span className="mt-1.5 h-1 w-10 rounded-sm" style={{ background: accent }} />
    </span>
  );
}

const TAGLINE_MAX = 80;

/** Accepte « RRGGBB » sans dièse, « #RGB » et « #RRGGBB ». */
function parseHex(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  return normalizeBrandColor(value.startsWith("#") ? value : `#${value}`);
}

export default function EventDesignPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const { locale, t } = useI18n();
  const isEn = locale === "en";

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  // "" = aucune couleur choisie : la page utilise la couleur par défaut.
  const [brandColor, setBrandColor] = useState("");
  const [layout, setLayout] = useState<EventLayoutId>("GRID");
  const [coverUrl, setCoverUrl] = useState("");
  const [pageStyle, setPageStyle] = useState<EventPageStyleValue>("AFFICHE");
  const [fontStyle, setFontStyle] = useState<EventFontStyleValue>("FESTIVAL");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewWidth, setPreviewWidth] = useState<"phone" | "desktop">("phone");
  const [isExtracting, setIsExtracting] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const parsedColor = parseHex(brandColor);
  const colorIsValid = brandColor.trim() === "" || parsedColor !== null;
  const theme = useMemo(() => buildEventTheme(parsedColor), [parsedColor]);
  const swatch = parsedColor ?? DEFAULT_BRAND_COLOR;
  const presetsByVibe = useMemo(() => getBrandPresetsByVibe(), []);
  const trimmedTagline = tagline.trim();
  const taglineTooShort = trimmedTagline.length === 1;
  const accentWasDarkened = theme.accentStrong.toLowerCase() !== theme.accent.toLowerCase();

  const current: Saved = {
    tagline: trimmedTagline,
    logoUrl: logoUrl.trim(),
    brandColor: parsedColor ?? "",
    layout,
    coverUrl: coverUrl.trim(),
    pageStyle,
    fontStyle
  };
  const isDirty = saved !== null && JSON.stringify(current) !== JSON.stringify(saved);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // Garde « modifications non enregistrées » à la sortie de la page.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const loadEvent = useCallback(
    async (token: string) => {
      const events = await apiFetch<EventDetail[]>("/events", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const found = events.find((item) => item.id === eventId);
      if (!found) {
        throw new Error(t("design.notFound"));
      }
      setTitle(found.title);
      setSlug(found.slug);
      setStatus(found.status);
      setTagline(found.tagline ?? "");
      setLogoUrl(found.logoUrl ?? "");
      setBrandColor(found.brandColor ?? "");
      setLayout(found.layout ?? "GRID");
      setCoverUrl(found.coverUrl ?? "");
      setPageStyle(found.pageStyle ?? "AFFICHE");
      setFontStyle(found.fontStyle ?? "FESTIVAL");
      setSaved({
        tagline: (found.tagline ?? "").trim(),
        logoUrl: found.logoUrl ?? "",
        brandColor: normalizeBrandColor(found.brandColor ?? "") ?? "",
        layout: found.layout ?? "GRID",
        coverUrl: found.coverUrl ?? "",
        pageStyle: found.pageStyle ?? "AFFICHE",
        fontStyle: found.fontStyle ?? "FESTIVAL"
      });
    },
    [eventId, t]
  );

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    void loadEvent(token)
      .catch((caughtError) => setLoadError(caughtError instanceof Error ? caughtError.message : t("design.loadFailed")))
      .finally(() => setIsLoading(false));
  }, [loadEvent, router, t]);

  const handleExtractColor = async () => {
    if (!logoUrl) return;
    setIsExtracting(true);
    try {
      const color = await extractColorFromImage(logoUrl);
      if (color) {
        setBrandColor(color);
        showToast.success(t("design.extracted"));
      } else {
        showToast.error(t("design.noDominant"));
      }
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
      setError(t("design.hexInvalid"));
      return;
    }
    if (taglineTooShort) {
      setError(t("design.taglineTooShort"));
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      // Un champ vidé part en null : l'API l'efface (M3).
      await apiFetch(`/events/${eventId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          layout,
          pageStyle,
          fontStyle,
          coverUrl: coverUrl.trim() || null,
          tagline: trimmedTagline || null,
          logoUrl: logoUrl.trim() || null,
          brandColor: parsedColor
        })
      });
      setSaved(current);
      showToast.success(t("design.saved"));
      setPreviewKey((k) => k + 1);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t("design.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={t("design.title")} />;
  }

  if (loadError) {
    return <FormError>{loadError}</FormError>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-24 sm:pb-0">
      <DashboardBreadcrumb
        isEn={isEn}
        items={[
          { label: t("design.crumbEvents"), href: "/dashboard/events" },
          { label: title, href: `/dashboard/events/${eventId}/candidates` },
          { label: t("design.crumb") }
        ]}
      />

      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t("design.title")}</h1>
          <p className="max-w-xl text-slate-600">{t("design.lead")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyPublicLinkButton eventSlug={slug} isEn={isEn} />
          <Button asChild variant="secondary">
            <Link href={publicEventPath(slug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("design.openPage")}
            </Link>
          </Button>
        </div>
      </header>

      {status !== "" && status !== "ACTIVE" && getStoredToken() ? (
        <ActivationPaymentPanel
          eventId={eventId}
          token={getStoredToken() ?? ""}
          isEn={isEn}
          title={t("design.publishTitle")}
          description={t("design.publishDesc")}
          onActivated={() => setStatus("ACTIVE")}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <Card className="p-5 lg:p-8">
          <form id="design-form" className="space-y-8" onSubmit={onSubmit} noValidate>
            <LogoUploadField value={logoUrl} onChange={setLogoUrl} token={getStoredToken() ?? ""} label={t("design.logo")} />

            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-semibold text-slate-900">{t("design.style.title")}</legend>
              <p className="text-xs text-slate-600">{t("design.style.lead")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("design.style.title")}>
                {PAGE_STYLES.map((id) => {
                  const selected = pageStyle === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPageStyle(id)}
                      className={`flex flex-col gap-3 rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-slate-900 ring-1 ring-slate-900" : "border-border hover:bg-accent/60"}`}
                    >
                      <StyleThumb style={id} accent={theme.accent} />
                      <span>
                        <span className="block font-semibold text-slate-900">{t(`design.style.${id}` as MessageKey)}</span>
                        <span className="mt-1 block text-xs text-slate-600">{t(`design.style.${id}.desc` as MessageKey)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <ImageUploadField
              value={coverUrl}
              onChange={setCoverUrl}
              token={getStoredToken() ?? ""}
              label={t("design.cover.title")}
              hint={t("design.cover.hint")}
              preview={
                <div className="flex aspect-[16/9] w-40 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">16:9</span>
                  )}
                </div>
              }
            />

            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-semibold text-slate-900">{t("design.font.title")}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("design.font.title")}>
                {FONT_STYLES.map((font) => {
                  const selected = fontStyle === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setFontStyle(font.id)}
                      className={`min-w-0 rounded-md border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-slate-900 ring-1 ring-slate-900" : "border-border hover:bg-accent/60"}`}
                    >
                      <span
                        className="block truncate text-2xl uppercase leading-tight text-slate-900"
                        style={{ fontFamily: font.family, fontWeight: font.weight }}
                      >
                        {title.split(/\s+/)[0] || "SHADOMA"}
                      </span>
                      <span className="mt-2 block text-sm font-semibold text-slate-900">{t(`design.font.${font.id}` as MessageKey)}</span>
                      <span className="block text-xs text-slate-600">{t(`design.font.${font.id}.desc` as MessageKey)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-semibold text-slate-900">{t("design.color")}</legend>
                {logoUrl ? (
                  <button
                    type="button"
                    onClick={() => void handleExtractColor()}
                    disabled={isExtracting}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary hover:bg-accent"
                  >
                    {isExtracting ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
                    {t("design.fromLogo")}
                  </button>
                ) : null}
              </div>

              {Object.entries(presetsByVibe).map(([vibe, presets]) => (
                <div key={vibe}>
                  <p className="mb-2 text-xs font-semibold text-slate-600">{t(`design.vibe.${vibe}` as MessageKey)}</p>
                  <div className="flex flex-wrap gap-3">
                    {presets.map((preset) => {
                      const selected = swatch.toLowerCase() === preset.color.toLowerCase();
                      const label = isEn ? preset.labelEn : preset.label;
                      return (
                        <button
                          key={preset.color}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setBrandColor(preset.color)}
                          className="flex w-16 flex-col items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span
                            className={`size-11 rounded-md border ${selected ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2" : "border-border"}`}
                            style={{ backgroundColor: preset.color }}
                            aria-hidden="true"
                          />
                          <span className="text-center text-xs leading-tight text-slate-600">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex items-start gap-3 pt-2">
                <input
                  type="color"
                  aria-label={t("design.pickColor")}
                  value={swatch}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-11 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
                />
                <div className="max-w-[220px] flex-1">
                  <Input
                    id="brandColor"
                    label={t("design.hex")}
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder={DEFAULT_BRAND_COLOR}
                    state={colorIsValid ? "default" : "error"}
                    errorText={colorIsValid ? undefined : t("design.hexInvalid")}
                  />
                </div>
              </div>

              {/* Échantillon plat dans le langage de la mini-plateforme : nav soulignée, bouton et lien en accent lisible. */}
              <div className="rounded-md border border-border bg-background p-4" style={theme.cssVars}>
                <p className="mb-3 text-xs font-semibold text-slate-600">{t("design.sample")}</p>
                <div className="flex items-center justify-between gap-3 border-b border-slate-900 pb-3">
                  <span className="truncate text-sm font-medium uppercase tracking-[0.3em] text-slate-900">{title}</span>
                  <span className="border-b pb-0.5 text-[11px] font-medium uppercase tracking-[0.22em]" style={{ borderColor: theme.accentStrong }}>
                    {t("minisite.results")}
                  </span>
                </div>
                {trimmedTagline ? (
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: theme.accentStrong }}>
                    {trimmedTagline}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span className="inline-flex h-11 items-center rounded-md px-5 text-sm font-semibold text-white" style={{ background: theme.accentStrong }}>
                    {t("design.samplePay")}
                  </span>
                  <span className="text-sm font-semibold underline underline-offset-4" style={{ color: theme.accentStrong }}>
                    {t("design.sampleLink")}
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-600" aria-live="polite">
                {t("design.contrastGood", { ratio: contrastRatio(theme.accentStrong, "#ffffff").toFixed(1) })}
              </p>
              {accentWasDarkened ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  {t("design.contrastAdjusted")}
                  <span className="inline-block size-5 rounded-md border border-border" style={{ background: theme.accentStrong }} aria-hidden="true" />
                  <span className="font-mono text-xs">{theme.accentStrong}</span>
                </p>
              ) : null}
            </fieldset>

            <div className="space-y-1">
              <Input
                id="tagline"
                label={t("design.tagline")}
                value={tagline}
                maxLength={TAGLINE_MAX}
                onChange={(e) => setTagline(e.target.value)}
                state={taglineTooShort ? "error" : "default"}
                errorText={taglineTooShort ? t("design.taglineTooShort") : undefined}
              />
              <p className="flex justify-between gap-3 text-xs text-slate-600">
                <span>{t("design.taglineHelp")}</span>
                <span className="tabular-nums">
                  {tagline.length}/{TAGLINE_MAX}
                </span>
              </p>
            </div>

            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-semibold text-slate-900">{t("design.layout")}</legend>
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
                      className={`rounded-md border p-4 text-left ${selected ? "border-slate-900 ring-1 ring-slate-900" : "border-border hover:bg-accent/60"}`}
                    >
                      <span className="block font-semibold text-slate-900">{isEn ? opt.en : opt.fr}</span>
                      <span className="mt-1 block text-xs text-slate-600">{isEn ? opt.descEn : opt.descFr}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <FormError>{error}</FormError>
            {isDirty ? <p className="text-sm text-slate-600">{t("design.unsaved")}</p> : null}

            {/* Collant en bas sur mobile, au-dessus de la zone de sécurité. */}
            <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:border-0 sm:p-0">
              <Button type="submit" loading={isSaving} className="h-12 flex-1 sm:flex-none">
                {t("design.save")}
              </Button>
              <Button type="button" variant="ghost" asChild className="hidden h-12 sm:inline-flex">
                <Link href={`/dashboard/events/${eventId}/candidates`}>{t("design.back")}</Link>
              </Button>
            </div>
          </form>
        </Card>

        <section aria-labelledby="preview-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="preview-title" className="text-lg font-bold text-slate-900">{t("design.preview")}</h2>
            <div className="flex gap-1" role="group" aria-label={t("design.preview")}>
              <Button type="button" variant={previewWidth === "phone" ? "secondary" : "ghost"} size="sm" className="min-h-11" aria-pressed={previewWidth === "phone"} onClick={() => setPreviewWidth("phone")}>
                {t("design.phone")}
              </Button>
              <Button type="button" variant={previewWidth === "desktop" ? "secondary" : "ghost"} size="sm" className="min-h-11" aria-pressed={previewWidth === "desktop"} onClick={() => setPreviewWidth("desktop")}>
                {t("design.desktop")}
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-600">{t("design.previewHelp")}</p>
          <div className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2">
            <iframe
              key={previewKey}
              title={t("design.previewTitle")}
              src={publicEventPath(slug)}
              className="mx-auto block h-[min(720px,70vh)] bg-background"
              style={{ width: previewWidth === "phone" ? 390 : "100%" }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
