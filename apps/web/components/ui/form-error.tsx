"use client";

import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Message d'erreur asynchrone annoncé aux lecteurs d'écran.
 * Remplace le pattern répété `<p className="vp-error">{error}</p>` (sans live region)
 * présent sur les 14 fichiers audités. `role="alert"` + `aria-live="assertive"`
 * garantissent l'annonce d'un échec de chargement ou de soumission.
 */
export interface FormErrorProps {
  /** Message à afficher ; rien n'est rendu si falsy. */
  children?: React.ReactNode;
  className?: string;
}

export function FormError({ children, className }: FormErrorProps) {
  if (!children) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
