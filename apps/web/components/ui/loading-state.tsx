"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * État de chargement accessible et stable (anti-CLS). Remplace le pattern
 * « Loading… » en texte brut : réserve la hauteur de la cible et annonce l'état
 * via `role="status" aria-live="polite"`.
 *
 * variant :
 *  - "kpi"  → rangée de cartes KPI
 *  - "rows" → lignes de liste/tableau
 *  - "form" → champs de formulaire
 */
export interface LoadingStateProps {
  /** Libellé annoncé (sr-only). */
  label?: string;
  variant?: "kpi" | "rows" | "form";
  /** Nombre d'éléments squelette. */
  count?: number;
  className?: string;
}

export function LoadingState({
  label = "Chargement…",
  variant = "rows",
  count = 3,
  className,
}: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {variant === "kpi" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      ) : null}

      {variant === "rows" ? (
        <div className="grid gap-2">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className={cn("h-14 w-full rounded-lg")} />
          ))}
        </div>
      ) : null}

      {variant === "form" ? (
        <div className="grid gap-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="grid gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
