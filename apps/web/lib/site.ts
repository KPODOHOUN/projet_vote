export const SITE_NAME = "SHADOMA Votes";

export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.trim() !== "")
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "https://shadoma-votes.vercel.app";

export function publicEventUrl(eventSlug: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}/e/${eventSlug}`;
}

/** Chemin public du concours ; avec le jeton d'aperçu, un brouillon reste visible par son organisateur. */
export function publicEventPath(eventSlug: string, previewToken?: string | null): string {
  return previewToken ? `/e/${eventSlug}?preview=${encodeURIComponent(previewToken)}` : `/e/${eventSlug}`;
}

export function publicCandidateUrl(eventSlug: string, publicRef: string): string {
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}/e/${eventSlug}/c/${publicRef}`;
}

export function publicCandidatePath(eventSlug: string, publicRef: string): string {
  return `/e/${eventSlug}/c/${publicRef}`;
}
