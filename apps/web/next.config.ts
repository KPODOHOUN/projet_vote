import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const imageHosts = [
  "https://res.cloudinary.com",
  "https://lh3.googleusercontent.com",
  "https://platform-lookaside.fbsbx.com",
  "https://graph.facebook.com"
];

// Collecteur optionnel des rapports de violation (voir security-headers.md).
// Valeur figée au build, comme toute la config Next.
const cspReportUri = (() => {
  const raw = process.env.CSP_REPORT_URI?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
})();

// CSP appliquée en production, Report-Only en développement (HMR, outils).
// CSP_REPORT_ONLY=true repasse en observation sans changer le code (voir
// docs/deployment/security-headers.md). Next injecte des scripts inline sans
// nonce, d'où 'unsafe-inline' tant qu'aucun nonce n'est en place.
const cspReportOnly = isDev || process.env.CSP_REPORT_ONLY === "true";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Les photos importées peuvent être servies par l'API (stockage en base).
  ["img-src 'self' data: blob:", ...imageHosts, originOf(process.env.NEXT_PUBLIC_API_BASE_URL)].filter(Boolean).join(" "),
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    originOf(process.env.NEXT_PUBLIC_API_BASE_URL),
    "https://api.cloudinary.com",
    "https://*.ingest.sentry.io",
    "https://*.ingest.de.sentry.io",
    isDev ? "ws:" : null
  ]
    .filter(Boolean)
    .join(" "),
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  cspReportUri ? `report-uri ${cspReportUri}; report-to csp` : null
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // L'éditeur d'apparence affiche la page publique dans une iframe du même site.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: cspReportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: contentSecurityPolicy },
  ...(cspReportUri ? [{ key: "Reporting-Endpoints", value: `csp="${cspReportUri}"` }] : [])
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    const apiOrigin =
      (process.env.API_BASE_URL && process.env.API_BASE_URL.trim() !== "")
        ? process.env.API_BASE_URL
        : "http://127.0.0.1:3001";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`
      }
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "platform-lookaside.fbsbx.com" },
      { protocol: "https", hostname: "graph.facebook.com" }
    ]
  },
  async redirects() {
    return [
      { source: "/admin.html", destination: "/admin", permanent: false },
      { source: "/dashboard/admin/:path*", destination: "/admin/:path*", permanent: true },
      { source: "/dashboard/payments", destination: "/dashboard/events", permanent: true },
      { source: "/admin/payments", destination: "/admin", permanent: true }
    ];
  }
};

export default withSentryConfig(nextConfig, {
  silent: true
});
