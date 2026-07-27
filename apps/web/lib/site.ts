export const SITE_NAME = "SHADOMA Votes";

export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.trim() !== "")
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "https://shadoma-votes.vercel.app";

export function publicEventUrl(eventSlug: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}/e/${eventSlug}`;
}

export function publicEventPath(eventSlug: string): string {
  return `/e/${eventSlug}`;
}

export function publicCandidateUrl(eventSlug: string, publicRef: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}/e/${eventSlug}/c/${publicRef}`;
}

export function publicCandidatePath(eventSlug: string, publicRef: string): string {
  return `/e/${eventSlug}/c/${publicRef}`;
}
