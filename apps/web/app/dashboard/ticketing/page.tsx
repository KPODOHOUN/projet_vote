"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ticket, ArrowRight, CalendarDays } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { authLoginUrl } from "../../../lib/auth-navigation";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, EmptyState, LoadingState, StatusChip } from "../../../components/ui";
import { formatEventStatus } from "../../../lib/i18n";

type EventItem = {
    id: string;
    title: string;
    slug: string;
    status: string;
    candidateCount: number;
};

export default function DashboardTicketingPage() {
    const router = useRouter();
    const { locale } = useI18n();
    const isEn = locale === "en";
    const [events, setEvents] = useState<EventItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const token = getStoredToken();
        if (!token) {
            router.push(authLoginUrl());
            return;
        }

        void apiFetch<EventItem[]>("/events", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(setEvents)
            .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Erreur de chargement."))
            .finally(() => setIsLoading(false));
    }, [router]);

    if (isLoading) {
        return <LoadingState variant="rows" count={4} label={isEn ? "Loading ticketing…" : "Chargement de la billetterie…"} />;
    }

    if (error) {
        return <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 font-medium text-destructive" role="alert">{error}</div>;
    }

    return (
        <div className="space-y-8">
            <header className="flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary"><Ticket className="h-4 w-4" />{isEn ? "Ticketing" : "Billetterie"}</span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{isEn ? "Manage your tickets" : "Gérez votre billetterie"}</h2>
                    <p className="max-w-2xl text-muted-foreground">{isEn ? "Choose an event to create ticket types, follow sales and validate your attendees." : "Choisissez un évènement pour créer vos types de billets, suivre les ventes et valider vos participants."}</p>
                </div>
                <Button asChild><Link href="/dashboard/events/new">{isEn ? "Create an event" : "Créer un évènement"}</Link></Button>
            </header>

            {events.length === 0 ? (
                <EmptyState
                    title={isEn ? "No events yet" : "Aucun évènement"}
                    description={isEn ? "Create an event before setting up your ticketing." : "Créez un évènement avant de configurer votre billetterie."}
                    action={<Button asChild><Link href="/dashboard/events/new">{isEn ? "Create event" : "Créer un évènement"}</Link></Button>}
                />
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {events.map((eventItem) => (
                        <article key={eventItem.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                            <div className="mb-5 flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></div>
                                    <div><h3 className="font-bold text-foreground">{eventItem.title}</h3><p className="mt-1 text-xs text-muted-foreground">{eventItem.candidateCount} {isEn ? "candidates" : "candidats"}</p></div>
                                </div>
                                <StatusChip label={formatEventStatus(eventItem.status, isEn)} tone={eventItem.status === "ACTIVE" ? "active" : "muted"} />
                            </div>
                            <Button asChild className="w-full gap-2"><Link href={`/dashboard/events/${eventItem.id}/tickets`}>{isEn ? "Manage ticketing" : "Gérer la billetterie"}<ArrowRight className="h-4 w-4" /></Link></Button>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
