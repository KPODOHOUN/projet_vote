"use client";

import { useI18n } from "@/lib/i18n-provider";
import { INTERNAL_PLATFORM_CAPABILITIES } from "@/lib/admin-users";
import { Card } from "@/components/ui";

export function InternalCapabilitiesPanel() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <Card className="border-dashed border-border bg-muted/20 p-6">
      <h2 className="text-lg font-bold text-foreground">
        {isEn ? "Internal API capabilities" : "Capacités API internes"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {isEn
          ? "These operations exist on the API but are intentionally not exposed in the web UI yet. Use ops tooling or direct API calls."
          : "Ces opérations existent côté API mais ne sont pas exposées dans l'interface web. Réservées aux outils ops ou appels API directs."}
      </p>
      <ul className="mt-4 space-y-3">
        {INTERNAL_PLATFORM_CAPABILITIES.map((cap) => (
          <li key={cap.id} className="rounded-lg border border-border/60 bg-card px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">{isEn ? cap.labelEn : cap.labelFr}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {cap.apiPrefix} · {cap.minRole}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
