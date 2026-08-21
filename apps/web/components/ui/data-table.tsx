"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /** Masquer ce champ en vue carte mobile (ex. colonne d'actions redondante). */
  hideInCard?: boolean;
  /** Champ affiché comme titre de carte ; par défaut : première colonne visible. */
  primary?: boolean;
  align?: "left" | "right";
};

export type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel: string;
  ariaLabel?: string;
  className?: string;
};

/**
 * Table responsive : vraie table sémantique >= md, vue cartes en dessous
 * (corrige P1-10 — tables admin desktop-first inutilisables au téléphone).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel,
  ariaLabel,
  className
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const cardColumns = columns.filter((col) => !col.hideInCard);
  const primaryKey =
    columns.find((col) => col.primary && !col.hideInCard)?.key ?? cardColumns[0]?.key;

  const cellContent = (row: T, col: DataTableColumn<T>): ReactNode =>
    col.render ? col.render(row) : null;

  return (
    <div className={className}>
      {/* Vue table >= md */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full border-collapse text-left text-sm" aria-label={ariaLabel}>
          <thead>
            <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "p-4",
                    col.align === "right" && "text-right"
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-muted/10">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("p-4 align-top", col.align === "right" && "text-right")}
                  >
                    {cellContent(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vue cartes < md */}
      <ul className="space-y-3 md:hidden" aria-label={ariaLabel}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="space-y-3 rounded-xl border border-border bg-card p-4"
          >
            {cardColumns.map((col) => {
              const content = cellContent(row, col);
              if (content == null) return null;
              if (col.key === primaryKey) {
                return (
                  <div key={col.key} className="font-semibold text-foreground">
                    {content}
                  </div>
                );
              }
              return (
                <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">{col.header}</span>
                  <span className="min-w-0 break-words text-right text-foreground">{content}</span>
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
