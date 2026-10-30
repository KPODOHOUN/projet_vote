import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Conteneur racine standard pour toutes les pages /admin. */
export function AdminPageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-6 sm:space-y-8">{children}</div>;
}

type AdminStatTileProps = {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  /** « alert » : à traiter (chiffre > 0) ; « ok » : rien à faire. */
  tone?: "neutral" | "alert" | "ok";
};

/** Grille de tuiles chiffres : un seul cadre, cellules séparées par des filets 1 px (DESIGN.md). */
export function AdminStatGrid({
  children,
  className,
  columns = "grid-cols-2 lg:grid-cols-3"
}: {
  children: ReactNode;
  className?: string;
  columns?: string;
}) {
  // Filets tracés par l'ombre droite/basse de chaque tuile, rognée sur le cadre :
  // une case vide en fin de ligne reste blanche au lieu de faire un trou gris.
  return (
    <div className={cn("grid overflow-hidden rounded-xl border border-border bg-card", columns, className)}>
      {children}
    </div>
  );
}

/** Tuile chiffre (dans `AdminStatGrid`) : même hauteur partout, cliquable vers la page qui traite le sujet. */
export function AdminStatTile({ label, value, hint, href, tone = "neutral" }: AdminStatTileProps) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
        {label}
        {href ? <ChevronRight className="size-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </span>
      <span
        className={cn(
          "mt-2 block text-2xl font-extrabold tabular-nums leading-tight [overflow-wrap:anywhere] sm:text-3xl",
          tone === "alert" ? "text-[var(--color-warning-text)]" : "text-foreground"
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className={cn("mt-2 block text-xs", tone === "ok" ? "text-[var(--color-success-text)]" : "text-muted-foreground")}>
          {hint}
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    "group flex min-h-[6.5rem] min-w-0 flex-col bg-card p-4 shadow-[1px_1px_0_0_var(--color-border)] transition-colors sm:min-h-[7.5rem] sm:p-5",
    href && "hover:bg-accent/40 focus-visible:relative focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

type AdminPageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

/** En-tête de page admin : fil d'Ariane visuel (eyebrow) + titre + description optionnelle. */
export function AdminPageHeader({ eyebrow, title, description, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <span className="text-sm font-semibold text-slate-600">{eyebrow}</span>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

type AdminFilterCardProps = {
  children: ReactNode;
  className?: string;
  columns?: string;
};

/** Carte de filtres / formulaire de recherche en haut de liste. */
export function AdminFilterCard({
  children,
  className,
  columns = "sm:grid-cols-2 lg:grid-cols-3"
}: AdminFilterCardProps) {
  return (
    <div className={cn("grid items-end gap-4 rounded-xl border border-border bg-card p-4 sm:p-5", columns, className)}>
      {children}
    </div>
  );
}

type AdminErrorAlertProps = {
  message: string;
};

export function AdminErrorAlert({ message }: AdminErrorAlertProps) {
  return (
    <div
      className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 font-medium text-destructive"
      role="alert"
    >
      {message}
    </div>
  );
}

type AdminSectionProps = {
  className?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

/** Sous-section avec titre h2 à l'intérieur d'une page admin. */
export function AdminSection({ title, description, children, actions, className }: AdminSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

type AdminSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  helpText?: string;
};

/** Select aligné sur le style Input (label + bordure cohérente). */
export function AdminSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  helpText
}: AdminSelectProps) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-11 w-full min-w-0 rounded-md sm:h-10 border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-background">
            {opt.label}
          </option>
        ))}
      </select>
      {helpText ? <p className="text-xs text-muted-foreground">{helpText}</p> : null}
    </div>
  );
}
