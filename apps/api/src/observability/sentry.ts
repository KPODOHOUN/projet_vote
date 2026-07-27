import * as Sentry from "@sentry/node";
import { env } from "../config/env";

let sentryInitialized = false;

export function initSentry() {
  if (sentryInitialized || !env.API_SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.API_SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.API_SENTRY_TRACES_SAMPLE_RATE
  });
  sentryInitialized = true;
}

export function captureSentryException(exception: unknown, context: Record<string, string | number>) {
  if (!env.API_SENTRY_DSN) {
    return;
  }
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setTag(key, value.toString());
    }
    Sentry.captureException(exception);
  });
}
