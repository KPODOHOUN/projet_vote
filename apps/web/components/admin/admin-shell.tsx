import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Conteneur racine standard pour toutes les pages /admin. */
export function AdminPageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-8">{children}</div>;
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
    <header className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <span className="text-sm font-bold uppercase tracking-widest text-primary">{eyebrow}</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="max-w-2xl text-muted-foreground">{description}</p> : null}
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
  columns = "md:grid-cols-3"
}: AdminFilterCardProps) {
  return (
    <div className={cn("grid gap-4 rounded-xl border border-border bg-card p-6", columns, className)}>
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
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

/** Sous-section avec titre h2 à l'intérieur d'une page admin. */
export function AdminSection({ title, description, children, actions }: AdminSectionProps) {
  return (
    <section className="space-y-4">
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
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

type AdminDataTableProps = {
  children: ReactNode;
  minWidth?: string;
};

export function AdminDataTable({ children, minWidth = "900px" }: AdminDataTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-muted/40 text-left">{children}</thead>;
}

export function AdminTableRow({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <tr className={cn("border-t border-border", className)}>{children}</tr>;
}

export function AdminTh({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 font-semibold", className)}>{children}</th>;
}

export function AdminTd({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
