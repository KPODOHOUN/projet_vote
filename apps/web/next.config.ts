import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
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
      { protocol: "https", hostname: "i.pravatar.cc" },
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
