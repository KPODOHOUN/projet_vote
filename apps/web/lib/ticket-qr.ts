/**
 * Lecture du contenu d'un QR code de billet : « https://site/t/<id>?s=<secret> ».
 * Accepte aussi un lien collé à la main (QR abîmé) ou un chemin relatif.
 * Renvoie null pour tout autre QR (site web quelconque, texte…).
 */
export function parseTicketQr(raw: string): { ticketId: string; secret: string } | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text, "https://billet.invalid");
  } catch {
    return null;
  }
  const match = url.pathname.match(/^\/t\/([A-Za-z0-9_-]{8,64})\/?$/);
  const secret = url.searchParams.get("s");
  if (!match || !secret || secret.length > 200) return null;
  return { ticketId: match[1]!, secret };
}
