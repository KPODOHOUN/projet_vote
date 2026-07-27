"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-8">
          <section className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-sm flex flex-col gap-6 text-center">
            <h1 className="text-2xl font-bold text-foreground m-0">Erreur critique</h1>
            <p className="text-sm font-medium text-destructive">
              Une erreur inattendue est survenue. L&apos;équipe technique a été notifiée.
            </p>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => reset()}>
              Réessayer
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
