import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";

/**
 * Jeton d'aperçu d'un concours en brouillon : la page publique d'un brouillon
 * n'est visible qu'avec lui (éditeur d'apparence, lien « Voir la page »). Il
 * n'est remis qu'à l'organisateur connecté, avec ses concours.
 */
const previewKey = createHmac("sha256", env.API_ORGANIZER_SECRET_KEY).update("event-preview:v1").digest();

export function eventPreviewToken(eventId: string): string {
  return createHmac("sha256", previewKey).update(eventId).digest("base64url");
}

export function isValidEventPreviewToken(eventId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(eventPreviewToken(eventId), "utf8");
  const given = Buffer.from(token, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
