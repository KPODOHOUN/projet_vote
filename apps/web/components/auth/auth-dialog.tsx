"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "../../lib/i18n-provider";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

export type AuthMode = "login" | "register";

export type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: AuthMode;
  returnTo?: string | null;
};

export function AuthDialog({ open, onOpenChange, initialMode = "login", returnTo = null }: AuthDialogProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const close = () => onOpenChange(false);

  // A11y modale : Escape, focus trap, verrouillage du scroll, restitution du
  // focus au déclencheur à la fermeture.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const list = Array.from(focusables);
      const first = list.at(0);
      const last = list.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onOpenChange]);

  // Focus initial sur le premier champ du formulaire actif (après la
  // transition d'entrée / de changement d'onglet).
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("form input")?.focus();
    }, 230);
    return () => window.clearTimeout(timer);
  }, [mode, open]);

  if (!open) return null;

  const tabs: Array<{ value: AuthMode; label: string }> = [
    { value: "login", label: t("auth.dialog.tabLogin") },
    { value: "register", label: t("auth.dialog.tabRegister") }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-black/60" onClick={close} aria-hidden="true" />
      <div className="relative my-auto w-full max-w-[420px]">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-dialog-title"
          data-zone="secure-flow"
          className="flex max-h-[90dvh] flex-col overflow-y-auto rounded-md border border-border bg-background"
        >
          {/* En-tête plat (7.5) : wordmark, titre, fermer en 44 px. */}
          <div className="relative border-b border-border px-6 pb-4 pt-5">
            <button
              type="button"
              onClick={close}
              className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-muted hover:text-slate-900"
              aria-label={t("auth.dialog.close")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="text-base font-extrabold tracking-tight text-slate-900">SHADOMA</p>
            <h2 id="auth-dialog-title" className="mt-2 text-xl font-bold text-slate-900">
              {mode === "login" ? t("auth.dialog.titleLogin") : t("auth.dialog.titleRegister")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {mode === "login" ? t("auth.dialog.subtitleLogin") : t("auth.dialog.subtitleRegister")}
            </p>
          </div>

          <div className="p-6">
            {/* Tab switcher — pilule glissante animée sous l'onglet actif */}
            <div role="tablist" aria-label={mode === "login" ? t("auth.dialog.titleLogin") : t("auth.dialog.titleRegister")} className="relative mb-5 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {tabs.map((tab) => {
                const selected = mode === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setMode(tab.value)}
                    className={`relative min-h-11 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                      selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selected ? (
                      <span className="absolute inset-0 rounded-md bg-background ring-1 ring-border" aria-hidden="true" />
                    ) : null}
                    <span className="relative">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div key={mode}>
                {mode === "login" ? (
                  <LoginForm hideHeading returnTo={returnTo} onSuccess={close} onSwitchToRegister={() => setMode("register")} />
                ) : (
                  <RegisterForm hideHeading onSuccess={close} onSwitchToLogin={() => setMode("login")} />
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
