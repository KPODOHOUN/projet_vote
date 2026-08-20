// app/e/[slug]/tickets/page.tsx — Billetterie publique d'un évènement.
// Server Component : fetch SSR de l'évènement (metadata + shell brandé
// PublicEventShell) ; le funnel d'achat vit dans tickets-client.tsx (React Query).
// fetchPublicEvent partagé : lib/public-event-fetch.ts (Task B7).

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicEventShell } from "../../../../components/public-event-shell";
import { getServerLocale } from "../../../../lib/locale-server";
import { SITE_NAME } from "../../../../lib/site";
import { translate } from "../../../../lib/i18n";
import { fetchPublicEvent } from "../../../../lib/public-event-fetch";

import { TicketsClient } from "./tickets-client";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getServerLocale();
  const data = await fetchPublicEvent(slug);
  if (!data) {
    return {
      title: `${translate(locale, "pub.voteNotFound")} · ${SITE_NAME}`,
      robots: { index: false, follow: false }
    };
  }
  const { event } = data;
  const title = `${translate(locale, "pub.buyTickets")} · ${event.title}`;
  const description = event.branding.tagline?.trim() || title;
  const url = `/e/${event.slug}/tickets`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "website" }
  };
}

export default async function PublicTicketsPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getServerLocale();
  const data = await fetchPublicEvent(slug);
  if (!data) {
    notFound();
  }

  const { event } = data;

  return (
    <PublicEventShell
      isEn={locale === "en"}
      eventTitle={event.title}
      slug={event.slug}
      branding={event.branding}
    >
      <main className="px-4 py-10">
        <TicketsClient slug={event.slug} />
      </main>
    </PublicEventShell>
  );
}
