"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { StatusChip, EmptyState, LoadingState, Button } from "@/components/ui";
import { CopyPublicLinkButton } from "../../../components/copy-public-link-button";
import { publicEventPath } from "../../../lib/site";
import { formatEventStatus } from "../../../lib/i18n";
import { ExternalLink, Users } from "lucide-react";

type EventItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  candidateCount: number;
};

export default function DashboardEventsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }

    void apiFetch<EventItem[]>("/events", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((items) => setEvents(items))
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : "Erreur de chargement.")
      )
      .finally(() => setIsLoading(false));
  }, [router]);

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading events…" : "Chargement des évènements…"} />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 font-medium text-destructive" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col justify-between gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <span className="block text-sm font-bold uppercase tracking-widest text-primary">{isEn ? "Events" : "Évènements"}</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{isEn ? "Your events" : "Vos évènements"}</h2>
        </div>
        <Button asChild>
          <Link href="/dashboard/start">{isEn ? "+ New event" : "+ Nouvel évènement"}</Link>
        </Button>
      </header>
      {events.length === 0 ? (
        <EmptyState
          title={isEn ? "No events yet." : "Aucun évènement pour le moment."}
          description={isEn ? "Get started by creating your first event." : "Commencez par créer votre premier évènement."}
          action={
            <Button asChild className="mt-2">
              <Link href="/dashboard/events/new">{isEn ? "Create event" : "Créer un évènement"}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {events.map((eventItem) => (
            <li
              key={eventItem.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow sm:flex-row sm:items-center"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <StatusChip
                  label={formatEventStatus(eventItem.status, isEn)}
                  tone={eventItem.status === "ACTIVE" ? "active" : "muted"}
                />
                <strong className="text-foreground">{eventItem.title}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="primary" className="shadow-sm">
                  <Link href={`/dashboard/events/${eventItem.id}`}>
                    {isEn ? "Manage" : "Gérer"}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary" className="gap-1.5 text-muted-foreground hover:text-foreground">
                  <Link href={`/dashboard/events/${eventItem.id}/candidates`}>
                    <Users className="h-3.5 w-3.5" />
                    {isEn ? "Candidates" : "Candidats"}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground">
                  <Link
                    href={publicEventPath(eventItem.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {isEn ? "View Page" : "Voir la page"}
                  </Link>
                </Button>
                <CopyPublicLinkButton eventSlug={eventItem.slug} isEn={isEn} size="sm" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
