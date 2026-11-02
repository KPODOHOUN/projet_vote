import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Sans secret de relais en production, l'API voit tous les visiteurs avec l'IP
    // du front (limites de débit communes) : signalé dès le démarrage.
    if (process.env.NODE_ENV === "production" && !process.env.EDGE_PROXY_SECRET) {
      console.error("[edge-proxy] EDGE_PROXY_SECRET manquant : l'IP des visiteurs n'est pas transmise à l'API (voir docs/deployment/staging-production.md).");
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
