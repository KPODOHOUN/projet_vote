"use client";

import { useEffect, useState } from "react";
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
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [mode, setMode] = useState<AuthMode>(initialMode);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const close = () => onOpenChange(false);

  if (!open) return null;

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
        <div className="vp-glass-strong flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl">
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
              aria-label={isEn ? "Close" : "Fermer"}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur shadow-inner">
              <span className="text-xl font-black text-white">SV</span>
            </div>
            <h2 className="text-xl font-bold text-white">
              {mode === "login"
                ? isEn ? "Welcome back" : "Bon retour"
                : isEn ? "Get started" : "Bienvenue"}
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {mode === "login"
                ? isEn ? "Sign in to your organizer account" : "Connectez-vous à votre espace"
                : isEn ? "Create your organizer account" : "Créez votre compte organisateur"}
            </p>
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            {/* Tab switcher */}
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => setMode("login")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${mode === "login"
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {isEn ? "Sign in" : "Connexion"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                onClick={() => setMode("register")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${mode === "register"
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {isEn ? "Sign up" : "Inscription"}
              </button>
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
