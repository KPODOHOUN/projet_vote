"use client";

/**
 * Couche d'adaptation : réexpose l'API historique des primitives `@ds/components`
 * (Button/Input/StatusChip/EmptyState/KpiCard/TrustBadge) — mêmes noms, mêmes props —
 * mais rendues sur les composants shadcn vendored. Permet aux 13 pages consommatrices
 * de continuer à importer `from "@/components/ui"` sans changement, tout en gagnant
 * les correctifs d'accessibilité (touch ≥44px, aria-busy, color-not-only, contraste).
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  PauseCircle,
  AlertTriangle,
  XCircle,
  Circle,
  FileText,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ── Button ────────────────────────────────────────────────────────────────
   API historique : variant primary|secondary|destructive|ghost + loading. */
type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

export interface ButtonProps
  extends Omit<React.ComponentProps<"button">, "color"> {
  variant?: ButtonVariant;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: "default" | "sm" | "lg" | "icon" | "xs" | "icon-xs" | "icon-sm" | "icon-lg";
  asChild?: boolean;
}

const VARIANT_MAP: Record<ButtonVariant, "default" | "secondary" | "destructive" | "ghost"> = {
  primary: "default",
  secondary: "secondary",
  destructive: "destructive",
  ghost: "ghost",
};

export function Button({
  variant = "primary",
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  size,
  asChild,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <ShadcnButton
        variant={VARIANT_MAP[variant]}
        size={size}
        asChild={true}
        className={cn("min-h-11 active:scale-[0.97] active:opacity-90 transition-all", className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {children}
      </ShadcnButton>
    );
  }

  return (
    <ShadcnButton
      variant={VARIANT_MAP[variant]}
      size={size}
      className={cn("min-h-11 active:scale-[0.97] active:opacity-90 transition-all", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span className="sr-only">Chargement…</span>
        </>
      ) : (
        leftIcon
      )}
      {children != null ? <span>{children}</span> : null}
      {!loading ? rightIcon : null}
    </ShadcnButton>
  );
}

/* ── Input (label + help/error/success) ──────────────────────────────────── */
type InputState = "default" | "error" | "success";

export interface InputProps extends React.ComponentProps<"input"> {
  label: string;
  // `| undefined` explicite : sous exactOptionalPropertyTypes, les pages passent
  // souvent ces textes depuis un objet d'erreurs partiel (valeur string | undefined).
  helpText?: string | undefined;
  errorText?: string | undefined;
  successText?: string | undefined;
  state?: InputState;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, helpText, errorText, successText, state = "default", className, ...props },
  ref
) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const successId = `${id}-success`;

  const describedBy = [
    state === "error" && errorText ? errorId : "",
    state === "success" && successText ? successId : "",
    helpText ? helpId : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <ShadcnInput
        ref={ref}
        id={id}
        aria-describedby={describedBy || undefined}
        aria-invalid={state === "error" ? true : undefined}
        className={cn(state === "success" && "border-[var(--color-success)]", className)}
        {...props}
      />
      {state === "error" && errorText ? (
        <p className="text-xs text-destructive" id={errorId} role="alert">
          {errorText}
        </p>
      ) : null}
      {state === "success" && successText ? (
        <p className="text-xs text-[var(--color-success)]" id={successId}>
          {successText}
        </p>
      ) : null}
      {helpText ? (
        <p className="text-xs text-muted-foreground" id={helpId}>
          {helpText}
        </p>
      ) : null}
    </div>
  );
});

/* ── StatusChip ──────────────────────────────────────────────────────────────
   Tons sémantiques avec icône (jamais la couleur seule) et paires de contraste
   ≥4.5:1 — corrige aussi le contraste warning/pending (amber trop clair). */
type ChipTone =
  | "live"
  | "active"
  | "pending"
  | "paused"
  | "success"
  | "warning"
  | "error"
  | "draft"
  | "muted";

const chipVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        live: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
        active:
          "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
        success:
          "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
        pending:
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
        warning:
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
        paused:
          "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
        error:
          "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
        draft:
          "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
        muted:
          "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
      },
    },
    defaultVariants: { tone: "muted" },
  }
);

const CHIP_ICON: Record<ChipTone, LucideIcon> = {
  live: Circle,
  active: CheckCircle2,
  success: CheckCircle2,
  pending: Clock,
  warning: AlertTriangle,
  paused: PauseCircle,
  error: XCircle,
  draft: FileText,
  muted: Circle,
};

export interface StatusChipProps extends VariantProps<typeof chipVariants> {
  label: string;
  tone: ChipTone;
}

export function StatusChip({ label, tone }: StatusChipProps) {
  const Icon = CHIP_ICON[tone] ?? Circle;
  return (
    <span className={chipVariants({ tone })}>
      <Icon
        className={cn("size-3", tone === "live" && "animate-pulse fill-current")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/* ── EmptyState ──────────────────────────────────────────────────────────── */
export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <section className="grid justify-items-start gap-2.5 rounded-xl border border-dashed border-border bg-muted/40 p-6">
      {icon ? <div aria-hidden="true">{icon}</div> : null}
      <h3 className="font-[var(--font-display)] text-xl leading-tight text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

/* ── KpiCard ─────────────────────────────────────────────────────────────── */
type Trend = "up" | "down" | "flat";

export interface KpiCardProps {
  label: string;
  value: string;
  trend?: Trend;
  trendLabel?: string;
}

const TREND_COLOR: Record<Trend, string> = {
  up: "text-[var(--color-success)]",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function KpiCard({ label, value, trend = "flat", trendLabel }: KpiCardProps) {
  return (
    <article className="grid gap-1.5 rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      {/* tabular-nums : chiffres alignés, pas de saut de largeur. */}
      <p className="font-[var(--font-display)] text-3xl leading-tight tabular-nums text-card-foreground">
        {value}
      </p>
      {trendLabel ? (
        <p className={cn("text-xs font-bold", TREND_COLOR[trend])}>{trendLabel}</p>
      ) : null}
    </article>
  );
}

/* ── TrustBadge ──────────────────────────────────────────────────────────── */
export interface TrustBadgeProps {
  label?: string;
}

export function TrustBadge({ label = "Vote certifié et vérifié" }: TrustBadgeProps) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-bold text-foreground"
      role="status"
    >
      <ShieldCheck className="size-4 text-[var(--color-success)]" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
