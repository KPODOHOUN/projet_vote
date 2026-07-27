// app/sitemap.ts — routes publiques pour le SEO (§F-10).
// Note : l'API n'expose PAS d'index public global des évènements (seulement
// /votes/public/:tenantSlug/events, tenant-scoped). On ne liste donc que les
// routes statiques réellement publiques — aucune URL inventée. Les pages
// /e/{slug} restent indexables (robots.ts) et découvrables par lien/OG.
import type { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    // /login volontairement absent : robots.ts le met en disallow (page
    // utilitaire). On ne liste que des URLs réellement indexables.
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/cookies`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal`, lastModified, changeFrequency: "yearly", priority: 0.3 }
  ];
}
