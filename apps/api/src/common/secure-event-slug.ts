import { randomBytes } from "node:crypto";
import { slugifyTitle } from "./slugify";

/** Slug évènement lisible + suffixe aléatoire (non devinable par énumération). */
export function generateSecureEventSlug(title: string): string {
  const base = slugifyTitle(title) || "event";
  const suffix = randomBytes(6).toString("base64url").slice(0, 8).toLowerCase();
  const slug = `${base}-${suffix}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug.length >= 3 ? slug : `event-${suffix}`;
}
