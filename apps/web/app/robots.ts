// app/robots.ts — §F-10. Le back-office et le vote tenant-scoped ne sont pas indexés ;
// les mini-plateformes publiques /e/{slug} le sont.
import type { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/login", "/vote/"]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
