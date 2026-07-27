"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  BarChart3,
  LayoutTemplate,
  Settings2,
  Users,
  ExternalLink,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { publicEventPath } from "@/lib/site";
import { Button, ConfirmDialog } from "@/components/ui";
import { DashboardBreadcrumb } from "./dashboard-breadcrumb";
import { CopyPublicLinkButton } from "./copy-public-link-button";

type EventDashboardShellProps = {
  isEn: boolean;
  eventTitle: string;
  eventSlug: string;
  eventStatus: string;
  children: React.ReactNode;
  onDeleteEvent?: () => void;
  deleting?: boolean;
};

const tabs = [
  { id: "overview", suffix: "", icon: BarChart3, labelFr: "Vue d'ensemble", labelEn: "Overview" },
  { id: "candidates", suffix: "/candidates", icon: Users, labelFr: "Candidats", labelEn: "Candidates" },
  { id: "design", suffix: "/design", icon: LayoutTemplate, labelFr: "Design", labelEn: "Design" },
  { id: "edit", suffix: "/edit", icon: Settings2, labelFr: "Réglages", labelEn: "Settings" }
] as const;

export function EventDashboardShell({
  isEn,
  eventTitle,
  eventSlug,
  eventStatus,
  children,
  onDeleteEvent,
  deleting = false
}: EventDashboardShellProps) {
  const params = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const base = `/dashboard/events/${params.eventId}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <DashboardBreadcrumb
        isEn={isEn}
        items={[
          { label: isEn ? "Events" : "Évènements", href: "/dashboard/events" },
          { label: eventTitle }
        ]}
      />

      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            {isEn ? "Event workspace" : "Espace évènement"}
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{eventTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isEn ? "Status" : "Statut"} : <span className="font-medium text-foreground">{eventStatus}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyPublicLinkButton eventSlug={eventSlug} isEn={isEn} />
          <Button asChild variant="secondary" size="sm">
            <Link href={publicEventPath(eventSlug)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 size-4" />
              {isEn ? "Public page" : "Page publique"}
            </Link>
          </Button>
          {onDeleteEvent ? (
            <ConfirmDialog
              disabled={deleting}
              title={isEn ? "Delete or archive event?" : "Supprimer ou archiver l'évènement ?"}
              description={
                isEn
                  ? "Events with paid votes will be archived instead of deleted. This cannot be undone easily."
                  : "Les évènements avec votes payés seront archivés plutôt que supprimés. Action difficilement réversible."
              }
              confirmLabel={isEn ? "Confirm" : "Confirmer"}
              cancelLabel={isEn ? "Cancel" : "Annuler"}
              onConfirm={onDeleteEvent}
              trigger={
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" loading={deleting}>
                  <Trash2 className="mr-1.5 size-4" />
                  {isEn ? "Delete" : "Supprimer"}
                </Button>
              }
            />
          ) : null}
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/30 p-1">
        {tabs.map((tab) => {
          const href = `${base}${tab.suffix}`;
          const active = tab.suffix === "" ? pathname === base : pathname.startsWith(href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                "inline-flex min-w-fit items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {isEn ? tab.labelEn : tab.labelFr}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
