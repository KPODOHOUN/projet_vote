// app/t/[ticketId]/page.tsx — Page d'un billet (lien privé porteur du secret ?s=).
// Server Component : interdit l'indexation et précharge l'image du billet dès le
// HTML ; le billet est lu côté serveur pour s'afficher dès le premier écran.
import type { Metadata } from "next";
import { preload } from "react-dom";

import { fetchPublicApi } from "../../../lib/server-api";
import { TicketValidationPage, type TicketDetail } from "./ticket-client";

type PageProps = {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ s?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Votre billet · SHADOMA",
  description: "Billet d'entrée nominatif avec QR code, valable une fois.",
  robots: { index: false, follow: false }
};

export default async function TicketPage({ params, searchParams }: PageProps) {
  const [{ ticketId }, { s }] = await Promise.all([params, searchParams]);
  if (typeof s !== "string" || !s) return <TicketValidationPage initialTicket={null} />;
  const ticket = await fetchPublicApi<TicketDetail>(`/public/tickets/${encodeURIComponent(ticketId)}?s=${encodeURIComponent(s)}`);
  // Image préchargée seulement quand la page l'affichera (billet payé ou utilisé).
  if (ticket && ["PAID", "CONFIRMED", "USED"].includes(ticket.status)) {
    preload(`/t/${encodeURIComponent(ticketId)}/image?s=${encodeURIComponent(s)}`, { as: "image", fetchPriority: "high" });
  }
  // Billet introuvable côté serveur : la page client réessaie et affiche l'erreur exacte.
  return <TicketValidationPage initialTicket={ticket} />;
}
