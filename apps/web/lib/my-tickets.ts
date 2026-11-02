/**
 * Billets achetés sur cet appareil, gardés dans le navigateur : l'acheteur les
 * retrouve sur la page de billetterie même sans e-mail ni compte. Chaque entrée
 * n'est qu'un lien vers le billet (identifiant + secret) — rien d'autre.
 */
export type MyTicket = {
  id: string;
  secret: string;
  holderName: string | null;
  ticketTypeName: string;
  boughtAt: string;
};

const KEY_PREFIX = "vp.my-tickets.";
const MAX_TICKETS = 60;

/** Ajoute des billets (les plus récents d'abord), sans doublon, borné. */
export function mergeMyTickets(existing: MyTicket[], added: MyTicket[]): MyTicket[] {
  const seen = new Set<string>();
  return [...added, ...existing]
    .filter((ticket) => (seen.has(ticket.id) ? false : (seen.add(ticket.id), true)))
    .slice(0, MAX_TICKETS);
}

export function readMyTickets(eventSlug: string): MyTicket[] {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + eventSlug);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((t): t is MyTicket => Boolean(t && typeof t.id === "string" && typeof t.secret === "string"))
      : [];
  } catch {
    return [];
  }
}

export function saveMyTickets(eventSlug: string, added: MyTicket[]): MyTicket[] {
  const next = mergeMyTickets(readMyTickets(eventSlug), added);
  try {
    window.localStorage.setItem(KEY_PREFIX + eventSlug, JSON.stringify(next));
  } catch {
    // Stockage indisponible (navigation privée) : les billets restent affichés pour cette visite.
  }
  return next;
}

/** Retire les billets de cet appareil (téléphone prêté ou partagé). */
export function clearMyTickets(eventSlug: string): void {
  try {
    window.localStorage.removeItem(KEY_PREFIX + eventSlug);
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

/** Chemin de la page d'un billet (porte son secret : à ne partager qu'avec son titulaire). */
export function ticketPagePath(id: string, secret: string): string {
  return `/t/${encodeURIComponent(id)}?s=${encodeURIComponent(secret)}`;
}

/** Message WhatsApp prêt à envoyer à l'invité. */
export function whatsappShareUrl(absoluteTicketUrl: string, eventTitle: string, holderName: string | null): string {
  const hello = holderName ? `Bonjour ${holderName}, voici ton billet` : "Voici ton billet";
  return `https://wa.me/?text=${encodeURIComponent(`${hello} pour ${eventTitle} : ${absoluteTicketUrl}\nPrésente le QR code à l'entrée (un seul passage).`)}`;
}
