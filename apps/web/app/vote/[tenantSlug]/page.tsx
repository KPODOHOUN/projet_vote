"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n-provider";
import { StatusChip, EmptyState } from "@/components/ui";
import { Card, Badge, Button } from "@/components/ui";
import { Calendar } from "lucide-react";
import { publicEventPath } from "../../../lib/site";

type VoteEventsPageProps = {
  params: Promise<{ tenantSlug: string }>;
};

type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
};

export default function VoteEventsPage({ params }: VoteEventsPageProps) {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then((resolvedParams) => {
      void apiFetch<PublicEvent[]>(`/votes/public/${resolvedParams.tenantSlug}/events`)
        .then((items) => setEvents(items))
        .catch((caughtError) => {
          setError(caughtError instanceof Error ? caughtError.message : isEn ? "Unable to load events." : "Impossible de charger les évènements.");
        })
        .finally(() => setIsLoading(false));
    });
  }, [params, isEn]);

  return (
    <main className="flex min-h-screen flex-col items-center bg-muted/30 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="mb-8 w-full max-w-4xl overflow-hidden rounded-2xl border-none bg-background p-6 shadow-xl sm:p-10 lg:p-12">
        <header className="mb-12 border-b border-border/50 pb-8">
          <Badge variant="outline" className="mb-6 w-fit border-primary/30 bg-primary/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            {isEn ? "Public events" : "Évènements publics"}
          </Badge>
          <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
            {isEn ? "Choose an event." : "Choisissez un évènement."}
          </h1>
          <p className="max-w-2xl text-lg font-medium text-muted-foreground">
            {isEn
              ? "Browse open paid voting events. Each event has its own public page."
              : "Parcourez les évènements de vote payant ouverts. Chaque évènement a sa propre page publique."}
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <p className="animate-pulse font-medium text-muted-foreground">{isEn ? "Loading events…" : "Chargement des évènements…"}</p>
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center font-medium text-destructive">{error}</div>
        ) : null}

        {!isLoading && !error && events.length === 0 ? (
          <EmptyState
            title={isEn ? "No active events" : "Aucun évènement actif"}
            description={isEn ? "No event available for this organizer." : "Aucun évènement disponible pour cet organisateur."}
          />
        ) : null}

        {!isLoading && !error && events.length > 0 ? (
          <ul className="space-y-4">
            {events.map((eventItem) => (
              <li key={eventItem.id} className="group">
                <Link
                  href={publicEventPath(eventItem.slug)}
                  className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/30 hover:bg-muted/50 sm:flex-row sm:items-center"
                >
                  <div className="flex flex-col gap-2">
                    <StatusChip label={eventItem.status} tone={eventItem.status === "ACTIVE" ? "active" : "muted"} />
                    <strong className="text-xl font-bold text-foreground transition-colors group-hover:text-primary">{eventItem.title}</strong>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {isEn ? "From" : "Du"} {new Date(eventItem.startsAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}{" "}
                      {isEn ? "to" : "au"} {new Date(eventItem.endsAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                    </span>
                  </div>
                  <Button variant="secondary" className="shrink-0 transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-105 group-hover:shadow-md">
                    {isEn ? "Vote now" : "Voter maintenant"}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </main>
  );
}
