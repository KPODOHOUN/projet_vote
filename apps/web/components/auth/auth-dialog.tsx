"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative my-auto w-full max-w-[420px]"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-dialog-title"
          className="vp-glass-strong flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl"
        >
          {/* Header gradient */}
          <div className="relative px-6 pt-8 pb-4 text-center"
            style={{
              background: "linear-gradient(135deg, var(--color-brand-500), var(--color-violet-600))"
            }}
          >
            <button
              type="button"
              onClick={close}
              className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
              aria-label={t("auth.dialog.close")}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur shadow-inner">
              <span className="text-xl font-black text-white">SV</span>
            </div>
            <h2 id="auth-dialog-title" className="text-xl font-bold text-white">
              {mode === "login" ? t("auth.dialog.titleLogin") : t("auth.dialog.titleRegister")}
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {mode === "login" ? t("auth.dialog.subtitleLogin") : t("auth.dialog.subtitleRegister")}
            </p>
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            {/* Tab switcher — pilule glissante animée sous l'onglet actif */}
            <div role="tablist" aria-label={mode === "login" ? t("auth.dialog.titleLogin") : t("auth.dialog.titleRegister")} className="relative mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
              {tabs.map((tab) => {
                const selected = mode === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setMode(tab.value)}
                    className={`relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selected ? (
                      <motion.span
                        layoutId="auth-tab-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-lg bg-card shadow-sm ring-1 ring-border/50"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="relative">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2 }}
              >
                {mode === "login" ? (
                  <LoginForm hideHeading returnTo={returnTo} onSuccess={close} onSwitchToRegister={() => setMode("register")} />
                ) : (
                  <RegisterForm hideHeading onSuccess={close} onSwitchToLogin={() => setMode("login")} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
