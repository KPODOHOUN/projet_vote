"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n-provider";

type ConsentState = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  consentedAt: string;
};

const COOKIE_NAME = "vp_cookie_consent";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const AUTO_COLLAPSE_MS = 4000;

function readConsentCookie(): ConsentState | null {
  if (typeof document === "undefined") {
    return null;
  }
  const raw = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${COOKIE_NAME}=`))
    ?.split("=")[1];
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(raw)) as ConsentState;
  } catch {
    return null;
  }
}

function writeConsentCookie(value: ConsentState) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}

export function CookieConsentCenter() {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [isVisible, setIsVisible] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [, setCompact] = useState(true);
  const [, setHidden] = useState(false);
  const [proof, setProof] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const existing = readConsentCookie();
    if (!existing) {
      setIsVisible(true);
      return;
    }
    setAnalytics(existing.analytics);
    setMarketing(existing.marketing);
    setProof(existing.consentedAt);
  }, []);

  // After consent saved, briefly show the full pill, then auto-collapse
  useEffect(() => {
    if (!proof || isVisible) return;
    setCompact(false);
    const timer = window.setTimeout(() => setCompact(true), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [proof, isVisible]);

  // Hide on scroll-down past 320px, reveal on scroll-up
  useEffect(() => {
    if (!proof || isVisible) return;
    let lastY = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - lastY;
        lastY = y;
        if (y < 240) {
          setHidden(false);
          return;
        }
        if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [proof, isVisible]);

  const saveConsent = (nextAnalytics: boolean, nextMarketing: boolean) => {
    const consentedAt = new Date().toISOString();
    const payload: ConsentState = {
      necessary: true,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      consentedAt
    };
    writeConsentCookie(payload);
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setProof(consentedAt);
    setIsVisible(false);
    setCompact(false);
    setHidden(false);
  };

  if (!isVisible && proof) {
    // The user has requested to remove the persistent cookie badge because it's annoying and ugly.
    // The /cookies page provides a way to manage preferences.
    return null;
  }

  if (!isVisible) {
    return null;
  }

  return (
    <aside
      className="fixed bottom-0 left-0 right-0 z-50 p-3 pointer-events-none sm:p-6"
      role="dialog"
      aria-modal="false"
      aria-label={isEn ? "Cookie preferences" : "Préférences cookies"}
    >
      <div className="mx-auto max-w-4xl pointer-events-auto flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-2xl animate-in slide-in-from-bottom-full duration-500 sm:gap-6 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 space-y-1.5 sm:space-y-2">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
            {isEn ? "Cookies · privacy" : "Cookies · confidentialité"}
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {isEn
              ? "Necessary cookies stay active for security. Choose what you allow beyond that."
              : "Les cookies nécessaires restent actifs pour la sécurité. Choisissez ce que vous autorisez au-delà."}{" "}
            <a className="font-medium text-foreground transition-colors hover:text-primary hover:underline" href="/cookies">
              {isEn ? "Learn more" : "En savoir plus"}
            </a>
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3">
          {showDetails ? (
            <div className="flex flex-col sm:flex-row gap-4 p-4 bg-muted/30 rounded-xl border border-border/50">
              <label className="flex items-center gap-2 cursor-not-allowed opacity-70">
                <input
                  type="checkbox"
                  checked
                  readOnly
                  className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary/50"
                  aria-label={isEn ? "Necessary cookies always on" : "Cookies nécessaires toujours actifs"}
                />
                <span className="text-xs font-medium text-foreground">{isEn ? "Necessary · always on" : "Nécessaires · toujours actifs"}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary/50"
                />
                <span className="text-xs font-medium text-foreground">{isEn ? "Analytics" : "Mesure d'audience"}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(event) => setMarketing(event.target.checked)}
                  className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary/50"
                />
                <span className="text-xs font-medium text-foreground">{isEn ? "Marketing" : "Marketing"}</span>
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:px-4 sm:text-sm"
              onClick={() => saveConsent(true, true)}
            >
              {isEn ? "Accept all" : "Tout accepter"}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:px-4 sm:text-sm"
              onClick={() => saveConsent(false, false)}
            >
              {isEn ? "Reject optional" : "Refuser optionnels"}
            </button>
            {showDetails ? (
              <button
                type="button"
                className="col-span-2 inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:col-span-1 sm:px-4 sm:text-sm"
                onClick={() => saveConsent(analytics, marketing)}
              >
                {isEn ? "Save choices" : "Enregistrer"}
              </button>
            ) : (
              <button
                type="button"
                className="col-span-2 inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:col-span-1 sm:px-4 sm:text-sm"
                onClick={() => setShowDetails(true)}
              >
                {isEn ? "Customize" : "Personnaliser"}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
