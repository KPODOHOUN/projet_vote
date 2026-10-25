"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Mail, MessageSquare, Share2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BrandIcon } from "./brand-icon";
import { BRAND_ICONS, type BrandIconId } from "../lib/brand-icons";
import { readableTextOnBackground } from "../lib/brand";
import { buildShareTargets, type ShareTarget } from "../lib/share-targets";
import { useI18n } from "../lib/i18n-provider";
import { showToast } from "../lib/toast";
import { trackEvent, type AnalyticsEventName } from "../lib/analytics";
import { cn } from "@/lib/utils";

type ShareSheetProps = {
  url: string;
  /** Titre court (objet d'e-mail, titre X / Reddit / Telegram). */
  title: string;
  /** Message complet, lien compris (WhatsApp, SMS, Threads, Bluesky). */
  text: string;
  /** Libellé du bouton qui ouvre le panneau. */
  label: string;
  /** "solid" : bouton plein (action principale) ; "outline" : bouton bordé. */
  appearance?: "solid" | "outline";
  className?: string;
  /** Appelé après une copie ou l'ouverture d'un réseau (suivi d'onboarding). */
  onShared?: (() => void) | undefined;
  analyticsEvent?: AnalyticsEventName;
  analyticsMeta?: Record<string, unknown>;
};

const SHEET_LABEL: Partial<Record<ShareTarget["id"], "share.email" | "share.sms">> = { email: "share.email", sms: "share.sms" };

function Tile({ target }: { target: ShareTarget }) {
  if (target.id === "email" || target.id === "sms") {
    const Icon = target.id === "email" ? Mail : MessageSquare;
    return (
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
    );
  }
  const brand = BRAND_ICONS[target.id as BrandIconId];
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: brand.hex }}>
      <BrandIcon id={target.id as BrandIconId} className="h-[26px] w-[26px]" color={readableTextOnBackground(brand.hex)} />
    </span>
  );
}

/**
 * Bouton « Partager » + panneau : lien copiable, réseaux avec leurs logos
 * officiels, et partage natif du téléphone (toutes les autres applications).
 * Feuille ancrée en bas sur téléphone, fenêtre centrée sur ordinateur.
 */
export function ShareSheet({
  url,
  title,
  text,
  label,
  appearance = "solid",
  className = "",
  onShared,
  analyticsEvent,
  analyticsMeta
}: ShareSheetProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  // Détectés après montage : navigator et la nature du pointeur n'existent qu'au client.
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    setIsTouch(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true);
  }, []);

  const targets = buildShareTargets({ url, text, title }).filter((target) => !target.mobileOnly || isTouch);

  const done = (channel: string) => {
    onShared?.();
    if (analyticsEvent) void trackEvent(analyticsEvent, { ...analyticsMeta, channel });
  };

  const copy = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      done("copy");
      return true;
    } catch {
      showToast.error(t("share.copyFailed"));
      return false;
    }
  };

  const nativeShare = async (appName?: string) => {
    if (canNativeShare) {
      try {
        await navigator.share({ title, text, url });
        done(appName ?? "native");
      } catch {
        /* partage annulé */
      }
      return;
    }
    // Sans partage natif (ordinateur) : on copie, et on dit où coller.
    if (await copy()) {
      showToast.success(appName ? t("share.pasteIn", { app: appName }) : t("share.copied"));
    }
  };

  const trigger: ReactNode =
    appearance === "solid" ? (
      <button
        type="button"
        className={cn(
          "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-6 text-[15px] font-bold text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
          className
        )}
      >
        <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
        {label}
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-current/30 px-5 text-sm font-semibold transition-colors hover:bg-current/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
          className
        )}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    );

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Focus sur « Copier » plutôt que sur le champ (qui surlignerait tout le lien).
          event.preventDefault();
          copyButtonRef.current?.focus();
        }}
        className="bottom-0 top-auto max-h-[92dvh] max-w-full translate-y-0 gap-5 overflow-y-auto rounded-b-none rounded-t-xl border-0 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-slate-900 sm:bottom-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%] sm:rounded-lg sm:p-6"
      >
        <div className="space-y-1 pr-8">
          <DialogTitle className="font-display text-xl font-bold">{t("share.sheetTitle")}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{t("share.sheetLead")}</DialogDescription>
        </div>

        <div>
          <label htmlFor="share-url" className="mb-1.5 block text-xs font-semibold text-slate-600">
            {t("share.linkLabel")}
          </label>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-1.5 pl-3">
            <input
              id="share-url"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 truncate bg-transparent font-mono text-[13px] text-slate-700 outline-none"
            />
            <button
              ref={copyButtonRef}
              type="button"
              onClick={() => void copy().then((ok) => ok && showToast.success(t("share.copied")))}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
              {copied ? t("share.copiedShort") : t("share.copyShort")}
            </button>
          </div>
        </div>

        <ul className="grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-5" role="list">
          {targets.map((target) => {
            const name = SHEET_LABEL[target.id] ? t(SHEET_LABEL[target.id]!) : BRAND_ICONS[target.id as BrandIconId].title;
            const inner = (
              <>
                <Tile target={target} />
                <span className="max-w-full truncate text-xs font-medium text-slate-700">{name}</span>
              </>
            );
            const tileClass =
              "flex w-full flex-col items-center gap-2 rounded-md py-1 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900";
            return (
              <li key={target.id} className="flex justify-center">
                {target.href ? (
                  <a
                    href={target.href}
                    target={target.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    onClick={() => done(target.id)}
                    className={tileClass}
                  >
                    {inner}
                  </a>
                ) : (
                  <button type="button" onClick={() => void nativeShare(name)} className={tileClass}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {canNativeShare ? (
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-slate-300 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {t("share.more")}
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
