"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultLocale, localeLabels, type Locale, type MessageKey, translate, translateVars } from "./i18n";
import { LOCALE_COOKIE, LEGACY_STORAGE_KEY } from "./locale-constants";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function persistLocale(locale: Locale) {
  document.documentElement.lang = locale;
  window.localStorage.setItem(LEGACY_STORAGE_KEY, locale);
  window.localStorage.setItem("vp.locale", locale);
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;SameSite=Lax`;
}

export function I18nProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem("vp.locale") ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored === "fr" || stored === "en") {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    persistLocale(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (newLocale) => {
        setLocaleState(newLocale);
        persistLocale(newLocale);
        router.refresh();
      },
      t: (key, vars) => (vars ? translateVars(locale, key, vars) : translate(locale, key))
    }),
    [locale, router]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }
  return context;
}

export function LanguageSwitcher({ variant = "default" }: { variant?: "default" | "brand-header" }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={
        variant === "brand-header"
          ? "inline-flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-full border"
          : "inline-flex gap-1 p-1 rounded-full bg-muted/50 border border-border"
      }
      style={
        variant === "brand-header"
          ? {
              background: "color-mix(in srgb, var(--event-header-fg, #ffffff) 15%, transparent)",
              borderColor: "color-mix(in srgb, var(--event-header-fg, #ffffff) 25%, transparent)"
            }
          : undefined
      }
      role="group"
      aria-label={t("lang.switch")}
    >
      {(Object.keys(localeLabels) as Locale[]).map((item) => {
        const isSelected = locale === item;
        return (
          <button
            key={item}
            type="button"
            className={
              variant === "brand-header"
                ? "min-h-[28px] sm:min-h-[32px] px-2 sm:px-3 rounded-full text-[11px] sm:text-xs font-bold tracking-wider uppercase transition-all"
                : `min-h-[32px] px-3 rounded-full text-xs font-semibold tracking-wider uppercase transition-colors ${
                    isSelected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-slate-600 hover:text-foreground"
                  }`
            }
            style={
              variant === "brand-header"
                ? isSelected
                  ? {
                      background: "var(--event-header-fg, #ffffff)",
                      color: "var(--event-header-bg, var(--color-brand-500))",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                    }
                  : {
                      // Pas d'opacité : le texte d'en-tête n'est garanti à 4,5:1 qu'à pleine couleur.
                      color: "var(--event-header-fg, #ffffff)"
                    }
                : undefined
            }
            aria-pressed={isSelected}
            onClick={() => setLocale(item)}
          >
            {localeLabels[item]}
          </button>
        );
      })}
    </div>
  );
}
